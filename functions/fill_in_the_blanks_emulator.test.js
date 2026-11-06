// Run with FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-rhx-fill-blanks.
// Text/image providers are injected; this suite never spends provider credits.
const test = require("node:test"), assert = require("node:assert/strict");
test("fill-in-the-blanks lifecycle against Firestore", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/, "Use an isolated emulator project.");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const cleared = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(cleared.status, 200);
  const {getFirestoreDb} = require("./utils/firebase/firebase_ops"), db = getFirestoreDb();
  const {normaliseConfig} = require("./features/fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
  const {createFillInTheBlanksQuestionGenerator} = require("./features/fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module");
  const practices = require("./features/fill_in_the_blanks_practice/fill_in_the_blanks_practice_module");
  const students = require("./features/student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module");
  const {createFillInTheBlanksScoringFeature} = require("./features/fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module");
  const {createFillInTheBlanksPracticeSession} = require("./features/fill_in_the_blanks_practice_session/fill_in_the_blanks_practice_session_module");
  const {createStudentFillInTheBlanksPracticeGenerator} = require("./features/student_fill_in_the_blanks_practice_generator/student_fill_in_the_blanks_practice_generator_module");
  const {processCompletedFillInTheBlanksPractice} = require("./triggers/student_fill_in_the_blanks_practice_completion_trigger");
  const daily = require("./features/daily_mission/daily_mission_module"), rewards = require("./features/reward/reward_module");
  const config = normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 3}}}, summaryHistory: {mode: "all", count: 20}});
  const metadata = {updatedBy: "test-admin", updatedAt: new Date()};
  await Promise.all([
    db.doc("syllabuses/fill-english").set({country: "MY", level: "primary", year: 1, subject: "English", active: true, languages: ["English"], assessmentFrameworkId: "fill-framework"}),
    db.doc("syllabuses/fill-english/topics/vocabulary").set({topicName: "Vocabulary", pausable: true, assessmentFrameworkIds: {english: "fill-framework"}}),
    db.doc("assessmentFrameworks/fill-framework").set({name: "Fill practice", frameworkType: "fillInTheBlanks", endLevelName: "Mastered"}),
    db.doc("assessmentFrameworks/fill-framework/levels/first").set({levelName: "First", sequenceOrder: 1, criteria: {requiredPracticeCount: 1, minimumScore: 60, questionsPerPractice: 1, difficultyLevel: "easy"}}),
    db.doc("assessmentFrameworks/fill-framework/levels/second").set({levelName: "Second", sequenceOrder: 2, criteria: {requiredPracticeCount: 2, minimumScore: 60, questionsPerPractice: 1, difficultyLevel: "hard"}}),
    db.doc("fillInTheBlanksQuestionGenerator/config").set({...config, ...metadata}),
    db.doc("rewards/config").set({...require("./schema/reward_schema").DEFAULT_REWARD_CONFIG, ...metadata}),
    db.doc("rewards/config/assessmentFrameworks/fill-framework").set({levelCoins: {first: 0, second: 7, endLevel: 10}, ...metadata}),
    db.doc("readinessConfigs/default").set({numberOfPractices: 5, preAssessmentWeight: 1, difficultyWeights: {easy: .75, medium: 1, hard: 1.75}, ...metadata}),
  ]);
  let textCalls = 0, alternativeCalls = 0;
  const questions = createFillInTheBlanksQuestionGenerator({authorize: async () => "test-admin", generateText: async prompt => {
    textCalls++; const data = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
    const generated = [{questionId: "q1", requiredWordCount: 2, correctAnswer: "the dog"}, {questionId: "q2", requiredWordCount: 1, correctAnswer: "sunny"},
      {questionId: "q3", requiredWordCount: 1, correctAnswer: "sister"}];
    let passageText = "I took {{q1}} to the park. It was {{q2}}. My {{q3}} came too.";
    for (let index = 3; index < data.questionsPerPassage; index++) {
      generated.push({questionId: "q" + (index + 1), requiredWordCount: 1, correctAnswer: "birds"}); passageText += " We saw {{q" + (index + 1) + "}}.";
    }
    return {passageText, summary: "Park outing " + textCalls, questions: generated, imagePrompt: null};
  }});
  const scoring = createFillInTheBlanksScoringFeature({generateText: async () => {alternativeCalls++; return {answers: [{questionId: "q1", isCorrect: true}]};}});
  const sessions = createFillInTheBlanksPracticeSession({students, practices, questions, scoring});
  const generation = createStudentFillInTheBlanksPracticeGenerator({questions, choose: () => 0});
  let passage, practice;
  await t.test("generation stores private keys, blank documents and grade/difficulty summaries", async () => {
    passage = await questions.generateFillInTheBlanksQuestion({syllabusId: "fill-english", topicId: "vocabulary", language: "English", difficulty: "easy"}, {trusted: true});
    assert.equal(passage.questions.length, 3); assert.equal(passage.questions[0].correctAnswer, undefined);
    const key = await db.doc(`fillInTheBlanksQuestions/fill-english/topics/vocabulary/languages/english/passages/${passage.passageId}/private/answerKey`).get();
    assert.equal(key.data().answers.q1, "the dog");
    practice = await practices.createFillInTheBlanksPractice({passageId: passage.passageId});
    assert.equal(practice.questions.length, 3);
  });
  await t.test("assignments exist independently of daily missions; reuse works across students", async () => {
    await students.assignFillInTheBlanksPracticeToStudent({studentId: "fill-student-a", practiceId: practice.id});
    await students.assignFillInTheBlanksPracticeToStudent({studentId: "fill-student-b", practiceId: practice.id});
    assert.equal((await db.collection("studentDailyMissions/fill-student-a/days").get()).size, 0);
    assert.equal((await students.listAssignedFillInTheBlanksPractices({studentId: "fill-student-a"})).practices.length, 1);
    const other = await practices.createFillInTheBlanksPractice({passageId: passage.passageId});
    const attempts = await Promise.allSettled([practice.id, other.id].map(practiceId => students.assignFillInTheBlanksPracticeToStudent({studentId: "fill-student-c", practiceId})));
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await students.listAssignedFillInTheBlanksPractices({studentId: "fill-student-c"})).practices.length, 1);
  });
  await t.test("replaying persistence cannot replace a saved passage's model answers", async () => {
    const {FirestorePassageRepository} = require("./features/fill_in_the_blanks_question_generator/infrastructure/firestore_passage_repository");
    const repository = new FirestorePassageRepository(), original = await repository.get(passage.passageId, {includeAnswers: true});
    await assert.rejects(repository.save({...original, questions: original.questions.map((q, index) => index ? q : {...q, correctAnswer: "a cat"})}), error => error.code === "already-exists");
    assert.equal((await repository.get(passage.passageId, {includeAnswers: true})).questions[0].correctAnswer, "the dog");
  });
  await t.test("daily missions wrap the assignment and result waits for alternative marking", async () => {
    const suggestion = await daily.getNextCoreDailyMission({studentId: "fill-student-a", syllabusId: "fill-english"});
    assert.equal(suggestion.practiceType, "fillInTheBlanks"); assert.equal(suggestion.practiceId, practice.id);
    await daily.acceptCoreDailyMission({studentId: "fill-student-a", practiceId: practice.id, practiceType: "fillInTheBlanks"});
    const before = await sessions.loadFillInTheBlanksPracticeSession({studentId: "fill-student-a", practiceId: practice.id});
    assert.equal(before.result, null); assert.equal(before.passage.questions[0].correctAnswer, undefined);
    const completed = await sessions.submitFillInTheBlanksPracticeSession({studentId: "fill-student-a", practiceId: practice.id,
      answers: {q1: "our puppy", q2: " SUNNY ", q3: ""}, timeTakenSeconds: 31});
    assert.equal(completed.status, "completed"); assert.equal(completed.result.questionsCorrect, 2); assert.equal(alternativeCalls, 1);
    assert.equal(completed.result.answers.q1.isCorrect, true); assert.equal(completed.result.answers.q3.markingMethod, "unanswered");
    assert.equal(await students.getAssignedFillInTheBlanksPractice({studentId: "fill-student-a", practiceId: practice.id}), null);
  });
  await t.test("progression, weighted readiness, reliability and existing rewards apply once", async () => {
    const outcome = await processCompletedFillInTheBlanksPractice({studentId: "fill-student-a", practiceId: practice.id}, {generation});
    assert.equal(outcome.assessment.levelId, "second");
    assert.ok(Math.abs((await db.doc("studentReadiness/fill-student-a/syllabuses/fill-english/topics/vocabulary").get()).data().score - 50) < 1e-10);
    const reliability = (await db.doc("reliability/fill-student-a/syllabuses/fill-english/topics/vocabulary").get()).data();
    assert.equal(reliability.completedPracticeCount, 1); assert.equal(reliability.score, 10);
    assert.equal(await rewards.getStudentRewardTotal({studentId: "fill-student-a"}), 32);
    assert.equal((await processCompletedFillInTheBlanksPractice({studentId: "fill-student-a", practiceId: practice.id}, {generation})).alreadyProcessed, true);
    assert.equal(await rewards.getStudentRewardTotal({studentId: "fill-student-a"}), 32);
  });
  await t.test("next assignment uses the new framework difficulty and generation completion is observable", async () => {
    const state = await generation.getFillInTheBlanksGenerationStatus({studentId: "fill-student-a", completedPracticeId: practice.id});
    assert.equal(state.status, "completed"); assert.notEqual(state.passageId, passage.passageId);
    const next = await students.getAssignedFillInTheBlanksPractice({studentId: "fill-student-a", practiceId: state.nextPracticeId});
    assert.equal(next.difficulty, "hard"); assert.equal(textCalls, 2);
    assert.equal((await daily.listAdditionalMissions({studentId: "fill-student-a", syllabusId: "fill-english"}))[0].practiceType, "fillInTheBlanks");
    const duplicate = await sessions.submitFillInTheBlanksPracticeSession({studentId: "fill-student-a", practiceId: practice.id,
      answers: {q1: "the dog", q2: "sunny", q3: "sister"}, timeTakenSeconds: 999});
    assert.equal(duplicate.result.questionsCorrect, 2); assert.equal(alternativeCalls, 1);
  });
  await t.test("bonus rewards and terminal framework completion use the existing shared rules", async () => {
    const studentId = "fill-student-a", initialNext = await generation.getFillInTheBlanksGenerationStatus({studentId, completedPracticeId: practice.id});
    await daily.acceptAdditionalDailyMission({studentId, practiceId: initialNext.nextPracticeId, practiceType: "fillInTheBlanks"});
    const answers = {q1: "the dog", q2: "sunny", q3: "sister"};
    await sessions.submitFillInTheBlanksPracticeSession({studentId, practiceId: initialNext.nextPracticeId, answers, timeTakenSeconds: 12});
    const firstHard = await processCompletedFillInTheBlanksPractice({studentId, practiceId: initialNext.nextPracticeId}, {generation});
    assert.equal(firstHard.assessment.levelId, "second");
    assert.equal(await rewards.getStudentRewardTotal({studentId}), 52);
    const finalId = firstHard.generation.nextPracticeId;
    await sessions.submitFillInTheBlanksPracticeSession({studentId, practiceId: finalId, answers, timeTakenSeconds: 11});
    const final = await processCompletedFillInTheBlanksPractice({studentId, practiceId: finalId}, {generation});
    assert.equal(final.assessment.levelId, "endLevel");
    const terminal = await generation.getFillInTheBlanksGenerationStatus({studentId, completedPracticeId: finalId});
    assert.equal(terminal.status, "completed"); assert.equal(terminal.outcome, "framework-completed"); assert.equal(terminal.nextPracticeId, null);
    assert.equal((await students.listAssignedFillInTheBlanksPractices({studentId})).practices.length, 0);
    assert.equal(await rewards.getStudentRewardTotal({studentId}), 62);
    await processCompletedFillInTheBlanksPractice({studentId, practiceId: finalId}, {generation});
    assert.equal(await rewards.getStudentRewardTotal({studentId}), 62);
  });
  await t.test("lost assignment response resumes the same next assignment without new generation", async () => {
    await sessions.submitFillInTheBlanksPracticeSession({studentId: "fill-student-b", practiceId: practice.id,
      answers: {q1: "the dog", q2: "sunny", q3: "sister"}, timeTakenSeconds: 20});
    let lost = true;
    const unstable = createStudentFillInTheBlanksPracticeGenerator({questions, choose: () => 0, progress: () => ({getStudentTopicLevel: async () => "second"}),
      students: {...students, assignFillInTheBlanksPracticeToStudent: async (...args) => {const saved = await students.assignFillInTheBlanksPracticeToStudent(...args);
        if (lost) {lost = false; throw new Error("Lost response");} return saved;}}});
    const input = {studentId: "fill-student-b", completedPracticeId: practice.id};
    await assert.rejects(unstable.generateNextStudentFillInTheBlanksPractice(input), /Lost response/);
    const failed = await unstable.getFillInTheBlanksGenerationStatus(input), calls = textCalls;
    assert.equal(failed.status, "failed");
    const retried = await unstable.generateNextStudentFillInTheBlanksPractice(input);
    assert.equal(retried.status, "completed"); assert.equal(retried.nextPracticeId, failed.nextPracticeId); assert.equal(textCalls, calls);
    assert.equal((await students.listAssignedFillInTheBlanksPractices({studentId: "fill-student-b"})).practices.length, 1);
  });
  await t.test("generation retries replace incompatible cached drafts after a grade-setting change", async () => {
    const {createHash} = require("node:crypto"), studentId = "fill-student-config";
    const sourceId = "initial-" + createHash("sha256").update(JSON.stringify(["fill-english", "vocabulary", practice.id])).digest("hex");
    await db.doc(`studentFillInTheBlanksPracticeGenerations/${studentId}/initials/${sourceId}`).set({status: "failed", nextPracticeId: "config-reservation",
      passageId: passage.passageId, draftId: passage.passageId, passageSource: "generated"});
    const changed = normaliseConfig({gradeSettings: {primary: {1: {questionsPerPassage: 4}}}});
    await db.doc("fillInTheBlanksQuestionGenerator/config").set({...changed, ...metadata});
    const input = {studentId, syllabusId: "fill-english", topicId: "vocabulary", practiceId: practice.id}, calls = textCalls;
    try {
      await assert.rejects(generation.assignInitialStudentFillInTheBlanksPractice(input), error => error.code === "configuration-changed");
      assert.equal(textCalls, calls, "An incompatible cached draft must not cause paid generation loops");
      assert.equal((await students.listAssignedFillInTheBlanksPractices({studentId})).practices.length, 0);
      const recovered = await generation.assignInitialStudentFillInTheBlanksPractice(input);
      assert.equal((await practices.getFillInTheBlanksPracticeById(recovered.nextPracticeId)).questions.length, 4);
      assert.equal(textCalls, calls + 1);
      assert.equal((await questions.getFillInTheBlanksQuestionById(passage.passageId)).questionCount, 3, "Existing content is immutable");
    } finally {await db.doc("fillInTheBlanksQuestionGenerator/config").set({...config, ...metadata});}
  });
  await t.test("marking failures retain original answers and publish no partial completion", async () => {
    const scope = {studentId: "fill-student-d", practiceId: practice.id};
    await students.assignFillInTheBlanksPracticeToStudent(scope); let fails = true;
    const recoverable = createFillInTheBlanksScoringFeature({generateText: async prompt => {
      if (fails) {fails = false; throw new Error("Temporary model outage");}
      assert.match(prompt, /our puppy/); return {answers: [{questionId: "q1", isCorrect: true}]};
    }});
    const session = createFillInTheBlanksPracticeSession({students, practices, questions, scoring: recoverable});
    await assert.rejects(session.submitFillInTheBlanksPracticeSession({...scope, answers: {q1: "our puppy", q2: "sunny", q3: ""}, timeTakenSeconds: 15}), /Temporary model outage/);
    assert.equal(await students.getCompletedFillInTheBlanksPractice(scope), null);
    assert.equal(await scoring.getFillInTheBlanksResult(scope), null);
    assert.equal((await students.getFillInTheBlanksSubmission(scope)).markingStatus, "failed");
    const recovered = await session.submitFillInTheBlanksPracticeSession({...scope, answers: {q1: "the dog", q2: "sunny", q3: "sister"}, timeTakenSeconds: 999});
    assert.equal(recovered.result.answers.q1.submittedAnswer, "our puppy");
    assert.equal(recovered.result.questionsCorrect, 2); assert.equal(recovered.result.timeTakenSeconds, 15);
  });
  await t.test("a replaced generation owner cannot publish an assignment", async () => {
    const practiceId = "stale-generation-practice", studentId = "fill-student-stale";
    await practices.createFillInTheBlanksPractice({passageId: passage.passageId, practiceId});
    const path = `studentFillInTheBlanksPracticeGenerations/${studentId}/initials/stale-job`;
    await db.doc(path).set({status: "generating", nextPracticeId: practiceId, leaseToken: "replacement-owner"});
    await assert.rejects(students.assignFillInTheBlanksPracticeToStudent({studentId, practiceId}, {generation: {path, leaseToken: "old-owner"}}), error => error.code === "generation-lease-lost");
    assert.equal(await students.getAssignedFillInTheBlanksPractice({studentId, practiceId}), null);
    await students.assignFillInTheBlanksPracticeToStudent({studentId, practiceId}, {generation: {path, leaseToken: "replacement-owner"}});
    assert.ok(await students.getAssignedFillInTheBlanksPractice({studentId, practiceId}));
  });
  await t.test("concurrent submissions share one marking operation", async () => {
    const scope = {studentId: "fill-student-e", practiceId: practice.id};
    await students.assignFillInTheBlanksPracticeToStudent(scope);
    let started, release, calls = 0;
    const entered = new Promise(resolve => {started = resolve;}), wait = new Promise(resolve => {release = resolve;});
    const concurrent = createFillInTheBlanksScoringFeature({generateText: async () => {calls++; started(); await wait; return {answers: [{questionId: "q1", isCorrect: true}]};}});
    const session = createFillInTheBlanksPracticeSession({students, practices, questions, scoring: concurrent});
    const input = {...scope, answers: {q1: "our puppy", q2: "sunny", q3: ""}, timeTakenSeconds: 10};
    const first = session.submitFillInTheBlanksPracticeSession(input); await entered;
    await assert.rejects(session.submitFillInTheBlanksPracticeSession(input), error => error.code === "marking-in-progress");
    release(); await first; assert.equal(calls, 1);
  });
  await t.test("subscription provisioning reserves one initial assignment and replays it safely", async () => {
    const syllabus = require("./features/syllabus/syllabus_module");
    await syllabus.assignTopicPreAssessmentPractice("fill-english", "vocabulary", "English", practice.id, "fillInTheBlanks");
    const {assignSubscriptionPreAssessmentPractices} = require("./triggers/syllabus_subscription_trigger");
    const input = {studentId: "fill-student-initial", syllabusId: "fill-english", language: "English"};
    await assignSubscriptionPreAssessmentPractices(input, {assignFillInTheBlanksPractice: assignment => generation.assignInitialStudentFillInTheBlanksPractice(assignment)});
    await assignSubscriptionPreAssessmentPractices(input, {assignFillInTheBlanksPractice: assignment => generation.assignInitialStudentFillInTheBlanksPractice(assignment)});
    const assigned = await students.listAssignedFillInTheBlanksPractices({studentId: input.studentId});
    assert.equal(assigned.practices.length, 1);
    const records = await db.collection("studentFillInTheBlanksPracticeGenerations/fill-student-initial/initials").get();
    assert.equal(records.size, 1); assert.equal(records.docs[0].data().status, "completed");
  });
  await t.test("all-history selection spans topics/languages and pages without mixing grades or difficulties", async () => {
    const batch = db.batch();
    for (let index = 0; index < 205; index++) batch.set(db.collection("fillInTheBlanksQuestions/history/topics/history/languages/tamil/passages").doc("summary-" + index),
      {format: "fillInTheBlanks", level: "primary", grade: 1, difficulty: "easy", summary: "Scene " + index, generatedAt: new Date(Date.now() + index)});
    batch.set(db.doc("fillInTheBlanksQuestions/history/topics/history/languages/tamil/passages/excluded"),
      {format: "fillInTheBlanks", level: "secondary", grade: 1, difficulty: "easy", summary: "Excluded secondary scene", generatedAt: new Date()});
    await batch.commit();
    const {FirestorePassageRepository} = require("./features/fill_in_the_blanks_question_generator/infrastructure/firestore_passage_repository");
    const repository = new FirestorePassageRepository(), criteria = {level: "primary", grade: 1, difficulty: "easy"};
    const all = await repository.summaries(criteria, {mode: "all", count: 20});
    assert.ok(all.length >= 206); assert.ok(all.includes("Scene 204")); assert.ok(all.includes("Scene 0"));
    assert.ok(!all.includes("Excluded secondary scene"));
    assert.equal((await repository.summaries(criteria, {mode: "recent", count: 20})).length, 20);
  });
  await t.test("topic-reset plans include new student state and retain pool, usage and coins", async () => {
    const {BuildResetPlan} = require("./features/student_topic_practice_reset/application/build_reset_plan");
    const {FirestoreTopicResetRepository} = require("./features/student_topic_practice_reset/infrastructure/firestore_topic_reset_repository");
    const builder = new BuildResetPlan({getFirestoreDb: () => db, getStudentById: async studentId => ({id: studentId, name: "Test student"}),
      getSyllabusById: require("./features/syllabus/syllabus_module").getSyllabusById, getPracticeById: async () => null});
    const input = {studentId: "fill-student-a", syllabusId: "fill-english", topicId: "vocabulary"}, plan = await builder.execute(input);
    assert.ok(plan.operations.some(operation => operation.path.startsWith("studentFillInTheBlanksPractices/")));
    assert.ok(plan.operations.some(operation => operation.path.startsWith("studentFillInTheBlanksPracticeGenerations/")));
    assert.ok(plan.operations.every(operation => !operation.path.startsWith("rewards/") && !operation.path.startsWith("userUsedFillInTheBlanksPassages/") && !operation.path.startsWith("fillInTheBlanksQuestions/")));
    const validator = new FirestoreTopicResetRepository();
    for (const operation of plan.operations) validator.validateOperation(operation, input);
  });
  await db.terminate();
});
