const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {withTopicResetGuard} = require("../utils/student_topic_reset_guard");
const {deepseekApiKey} = require("../deepseek");
const {getCompletedEssayPractice, claimEssayPracticeScoring, setEssayPracticeScoringStatus} = require("../features/student_essay_practice/student_essay_practice_module");
const {scoreEssay, saveEssayResult, getEssayResult} = require("../features/essay_scoring/essay_scoring_module");
const {awardDailyMissionCompletion, awardAdditionalMissionCompletion, awardAssessmentLevelUp} = require("../features/reward/reward_module");
const {assessStudentEssayPractice} = require("../features/student_assessment_progress/student_assessment_progress_module");
const {generateNextStudentEssayPractice} = require("../features/student_essay_practice_generator/student_essay_practice_generator_module");
const {calculateReadinessScore, saveReadinessScore, calculateSubjectReadinessScore, saveSubjectReadinessScore} = require("../features/readiness/readiness_module");
const {calculateTopicReliabilityScore, saveTopicReliabilityScore,
  calculateSubjectReliabilityScore, saveSubjectReliabilityScore} = require("../features/reliability/reliability_module");

async function scoreCompletedStudentEssay(input, {
  getCompletion = getCompletedEssayPractice,
  getResult = getEssayResult,
  score = scoreEssay,
  saveResult = saveEssayResult,
  setStatus = setEssayPracticeScoringStatus,
  claimScoring = claimEssayPracticeScoring,
  awardDailyMission = awardDailyMissionCompletion,
  awardAdditionalMission = awardAdditionalMissionCompletion,
  generateNextEssay = generateNextStudentEssayPractice,
  assessEssay = assessStudentEssayPractice,
  awardLevelUp = awardAssessmentLevelUp,
  calculateReadiness = calculateReadinessScore,
  saveReadiness = saveReadinessScore,
  calculateSubjectReadiness = calculateSubjectReadinessScore,
  saveSubjectReadiness = saveSubjectReadinessScore,
  calculateTopicReliability = calculateTopicReliabilityScore,
  saveTopicReliability = saveTopicReliabilityScore,
  calculateSubjectReliability = calculateSubjectReliabilityScore,
  saveSubjectReliability = saveSubjectReliabilityScore,
} = {}) {
  const {studentId, essayPracticeId} = input;
  const scope = {studentId, essayPracticeId};
  const completion = await getCompletion(scope);
  if (!completion) throw new Error("Saved essay submission could not be found.");

  // Reward policy and deduplication belong to Reward. A grading failure must not
  // prevent the student from receiving coins for a saved Daily Mission completion.
  const rewardScope = {studentId, practiceId: essayPracticeId, practiceType: "essay"};
  const rewardOperation = Promise.resolve().then(() => awardDailyMission(rewardScope));
  const additionalRewardOperation = Promise.resolve().then(() => awardAdditionalMission(rewardScope));
  const scoringOperation = (async () => {
    // Claim errors must not overwrite another active worker's grading status.
    if (!await claimScoring(scope)) return getResult({studentId, questionId: completion.essayQuestionId});
    try {
      const reference = {studentId, questionId: completion.essayQuestionId};
      const existing = await getResult(reference);
      if (existing?.answer === completion.essayText && existing.reviewComment?.trim()) {
        const saved = await saveResult({...reference, answer: completion.essayText,
          score: existing.score, reviewComment: existing.reviewComment, corrections: existing.corrections}, {submittedAt: completion.completedAt});
        await setStatus({...scope, status: saved.answer === completion.essayText ? "completed" : "superseded"});
        return saved;
      }
      const result = await score({questionId: completion.essayQuestionId, answer: completion.essayText});
      const saved = await saveResult({...reference, answer: completion.essayText, ...result}, {submittedAt: completion.completedAt});
      await setStatus({...scope, status: saved.answer === completion.essayText ? "completed" : "superseded"});
      return saved;
    } catch (error) {
      try {await setStatus({...scope, status: "failed"});} catch (statusError) {
        logger.error("Could not store essay scoring failure status.", {...scope, message: statusError.message});
      }
      logger.error("Essay scoring failed; submission is retained for retry.", {...scope, message: error.message});
      throw error;
    }
  })();
  const topicScope = {studentId, syllabusId: completion.syllabusId, topicId: completion.topicId};
  const subjectScope = {studentId, syllabusId: completion.syllabusId};
  // Reliability depends on the saved submission, independently of AI grading.
  const reliabilityOperation = (async () => {
    const topic = await calculateTopicReliability(topicScope);
    await saveTopicReliability({...topicScope, ...topic});
    const score = await calculateSubjectReliability(subjectScope);
    if (score !== null) await saveSubjectReliability({...subjectScope, score});
  })();
  // A grading retry must also retry downstream work even when grading itself is complete.
  const readinessOperation = scoringOperation.then(async () => {
    const score = await calculateReadiness(topicScope);
    if (score === null) return;
    await saveReadiness({...topicScope, score, practiceId: essayPracticeId, practiceType: "essay"});
    const subjectScore = await calculateSubjectReadiness(subjectScope);
    if (subjectScore !== null) await saveSubjectReadiness({...subjectScope, score: subjectScore,
      practiceId: essayPracticeId, practiceType: "essay"});
  });
  const assessmentOperation = scoringOperation.then(result => result?.answer === completion.essayText ? assessEssay(scope) : null);
  const levelRewardOperation = assessmentOperation.then(outcome => outcome?.assessed
    ? awardLevelUp({studentId, practiceId: essayPracticeId}) : null);
  const generationOperation = assessmentOperation.then(() => generateNextEssay({studentId, completedEssayPracticeId: essayPracticeId},
    {updatedBy: "system:onStudentEssayPracticeCompleted"}));
  // Await every independent branch so failures cannot cancel successful work.
  const [reward, additionalReward, scoring, reliability, readiness, assessment, levelReward, generation] = await Promise.allSettled([
    rewardOperation, additionalRewardOperation, scoringOperation, reliabilityOperation, readinessOperation, assessmentOperation, levelRewardOperation, generationOperation,
  ]);
  if (scoring.status === "rejected") throw scoring.reason;
  for (const [stage, outcome] of [["assessment", assessment], ["levelReward", levelReward], ["reliability", reliability], ["readiness", readiness], ["generation", generation], ["reward", reward], ["additionalReward", additionalReward]]) {
    if (outcome.status === "rejected") {
      logger.error("Essay completion follow-up failed; the saved grade is retained for retry.", {...scope, stage, message: outcome.reason?.message});
      throw outcome.reason;
    }
  }
  return scoring.value;
}

const onStudentEssayPracticeCompleted = onDocumentCreated({
  document: "studentEssayPractices/{studentId}/completedEssayPractices/{essayPracticeId}",
  region: "us-central1", memory: "1GiB", timeoutSeconds: 540,
  secrets: [deepseekApiKey], retry: true,
}, async event => {
  const source = event.data?.data();
  if (!source) return null;
  try {
    return await withTopicResetGuard({studentId: event.params.studentId, createdAt: event.data.createTime,
      scopes: [{syllabusId: source.syllabusId, topicId: source.topicId}]}, () => scoreCompletedStudentEssay(event.params));
  } catch (error) {
    if (error.code !== "topic-practice-reset") throw error;
    logger.info("Ignoring an essay completion cancelled by a topic reset.", event.params);
    return null;
  }
});

module.exports = {scoreCompletedStudentEssay, onStudentEssayPracticeCompleted};
