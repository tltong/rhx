const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {randomUUID} = require("node:crypto");
const {getFirestoreDb} = require("../utils/firebase/firebase_ops");
const {withTopicResetGuard, guardResetTransaction, guardStudentMaintenance} = require("../utils/student_topic_reset_guard");
const {deepseekApiKey} = require("../deepseek");
const {openaiApiKey} = require("../utils/llm/openai_util");
const {problem, id} = require("../features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
async function processCompletedFillInTheBlanksPractice(input, overrides = {}) {
  const db = overrides.getDb?.() ?? getFirestoreDb(), studentId = id(input.studentId), practiceId = id(input.practiceId);
  const source = db.collection("studentFillInTheBlanksPractices").doc(studentId).collection("completedPractices").doc(practiceId);
  const snapshot = await source.get();
  if (!snapshot.exists) return null;
  const completion = snapshot.data(), topic = {studentId, syllabusId: completion.syllabusId, topicId: completion.topicId};
  const scope = {studentId, practiceId}, rewardScope = {...scope, practiceType: "fillInTheBlanks"};
  return withTopicResetGuard({studentId, createdAt: snapshot.createTime, scopes: [topic]}, async () => {
    const processing = source.parent.parent.collection("completionProcessing").doc(practiceId), token = randomUUID();
    const claim = await db.runTransaction(async tx => {
      await guardResetTransaction(tx, db); await guardStudentMaintenance(tx, db.collection("studentPracticeResets").doc(studentId));
      const saved = await tx.get(processing), data = saved.data(), until = data?.leaseUntil?.toDate?.() ?? data?.leaseUntil;
      if (data?.status === "completed") return false;
      if (data?.status === "processing" && until > new Date()) throw problem("Completion processing is already running.", "completion-in-progress");
      tx.set(processing, {status: "processing", stage: "assessment", leaseToken: token,
        leaseUntil: new Date(Date.now() + 10 * 60 * 1000), updatedAt: new Date(), errorCode: null});
      return true;
    });
    if (!claim) return {alreadyProcessed: true};
    async function update(fields) {
      await db.runTransaction(async tx => {
        await guardResetTransaction(tx, db);
        const [saved, original] = await Promise.all([tx.get(processing), tx.get(source)]);
        if (!original.exists || saved.data()?.leaseToken !== token) throw problem("The completion was reset or its processing attempt changed.", "topic-practice-reset");
        tx.update(processing, {...fields, updatedAt: new Date()});
      });
    }
    const assessment = overrides.assessment ?? require("../features/student_assessment_progress/student_assessment_progress_module");
    const readiness = overrides.readiness ?? require("../features/readiness/readiness_module");
    const reliability = overrides.reliability ?? require("../features/reliability/reliability_module");
    const rewards = overrides.rewards ?? require("../features/reward/reward_module");
    const generation = overrides.generation ?? require("../features/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module");
    try {
      const outcome = await assessment.assessStudentFillInTheBlanksPractice(scope);
      await update({stage: "follow-up"});
      const subject = {studentId, syllabusId: completion.syllabusId};
      const results = await Promise.allSettled([
        (async () => {
          const score = await readiness.calculateReadinessScore(topic);
          if (score !== null) await readiness.saveReadinessScore({...topic, score, practiceId, practiceType: "fillInTheBlanks"});
          const subjectScore = await readiness.calculateSubjectReadinessScore(subject);
          if (subjectScore !== null) await readiness.saveSubjectReadinessScore({...subject, score: subjectScore, practiceId, practiceType: "fillInTheBlanks"});
        })(),
        (async () => {
          const score = await reliability.calculateTopicReliabilityScore(topic);
          await reliability.saveTopicReliabilityScore({...topic, ...score});
          const subjectScore = await reliability.calculateSubjectReliabilityScore(subject);
          if (subjectScore !== null) await reliability.saveSubjectReliabilityScore({...subject, score: subjectScore});
        })(),
        rewards.awardDailyMissionCompletion(rewardScope), rewards.awardAdditionalMissionCompletion(rewardScope),
        outcome?.assessed ? rewards.awardAssessmentLevelUp(scope) : Promise.resolve(null),
        generation.generateNextStudentFillInTheBlanksPractice({studentId, completedPracticeId: practiceId}),
      ]);
      const failure = results.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
      await update({status: "completed", stage: "completed", generatedPracticeId: results.at(-1).value?.nextPracticeId ?? null,
        completedAt: new Date(), leaseToken: null, leaseUntil: null});
      return {assessment: outcome, generation: results.at(-1).value};
    } catch (error) {
      await update({status: "failed", errorCode: String(error.code ?? "completion-failed"), leaseToken: null, leaseUntil: null}).catch(() => {});
      throw error;
    }
  }, {getFirestoreDb: () => db});
}
const onStudentFillInTheBlanksPracticeCompleted = onDocumentCreated({
  document: "studentFillInTheBlanksPractices/{studentId}/completedPractices/{practiceId}",
  region: "us-central1", memory: "1GiB", timeoutSeconds: 540, minInstances: 0,
  secrets: [deepseekApiKey, openaiApiKey], retry: true,
}, async event => {
  if (!event.data?.exists) return null;
  try {return await processCompletedFillInTheBlanksPractice(event.params);}
  catch (error) {
    if (error.code === "topic-practice-reset") {logger.info("Ignoring reset fill-in-the-blanks completion", event.params); return null;}
    logger.error("Fill-in-the-blanks completion follow-up failed", {...event.params, code: error.code, message: error.message});
    throw error;
  }
});
module.exports = {processCompletedFillInTheBlanksPractice, onStudentFillInTheBlanksPracticeCompleted};
