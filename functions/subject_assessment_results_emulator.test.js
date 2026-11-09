const {test} = require("node:test"), assert = require("node:assert/strict");

test("assessment answer sessions and marking use dedicated immutable storage", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const db = require("./utils/firebase/firebase_ops").getFirestoreDb();
  const {createSubjectAssessmentFeature} = require("./features/subject_assessment/subject_assessment_module");
  const {createAssessmentAuthorizer} = require("./features/subject_assessment/infrastructure/access");
  const {FirestoreSubjectAssessmentSubmissionRepository: Submissions} = require("./features/subject_assessment/infrastructure/firestore_subject_assessment_submission_repository");
  const {FirestoreSubjectAssessmentRepository: Assessments} = require("./features/subject_assessment/infrastructure/firestore_subject_assessment_repository");
  const {makeItem, publicItem, slotId, clean} = require("./features/subject_assessment/domain/subject_assessment");
  const {SCORING_POLICY} = require("./features/subject_assessment/domain/subject_assessment_submission");
  const {ScoreEssay} = require("./features/essay_scoring/application/score_essay");
  const essayConfig = require("./features/essay_scoring/domain/essay_scoring_config").createDefaultConfiguration();
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(reset.status, 200);
  const student = {auth: {uid: "student"}}, guardian = {auth: {uid: "guardian"}}, administrator = {auth: {uid: "admin"}};
  const expectedScore = (100 + 80 + 100) / 3;
  await db.doc("guardianStudentLinks/guardian__student").set({state: "active"});
  const authorize = createAssessmentAuthorizer({getDb: () => db, getUser: async uid => ({uid, email: uid + "@example.test", emailVerified: true}), isAdministrator: async email => email === "admin@example.test"});
  let settingsVersion = "Original instructions", essayCalls = 0, passageCalls = 0, failPassage = false;
  let essayGate = null, entered;
  const scorer = new ScoreEssay({getEssayQuestionById: () => assert.fail("Never reread pool content"), getEssayScoringConfig: () => assert.fail("Use frozen settings"),
    generateLlmText: async prompt => {
      essayCalls++; assert.match(prompt, /Frozen essay task/); assert.match(prompt, /Original instructions/); assert.match(prompt, /"grade": 4/);
      if (essayGate) {entered(); await essayGate;}
      return {score: 80, reviewComment: "Clear ideas; develop the ending.", corrections: [{originalText: "park", correctedText: "garden", explanation: "Use a more precise place."}]};
    }});
  const dependencies = {authorize, loadSettings: async () => ({policy: SCORING_POLICY, essay: {...essayConfig, additionalLlmInstructions: settingsVersion}, fill: {markingInstructions: settingsVersion}}),
    scoreEssay: input => scorer.executeSnapshot(input), generateText: async prompt => {
      passageCalls++; assert.match(prompt, /Original instructions/);
      if (failPassage) throw new Error("Provider error with private details");
      return {answers: [{questionId: "q2", isCorrect: true}]};
    }};
  const api = createSubjectAssessmentFeature(dependencies);
  async function createPaper(assessmentId) {
    const common = {syllabusId: "english", language: "English", level: "primary", standard: 4, difficulty: "medium"};
    const items = await Promise.all([
      makeItem({position: 1, topicId: "reading", questionType: "normal", difficulty: "medium"}, {...common, id: "mcq", topicId: "reading", hasDiagram: false,
        questionText: "Frozen MCQ task", options: {a: "One", b: "Two", c: "Three", d: "Four"}, correctAnswer: "b", explanation: "Two is correct."}, "reused", "Reading"),
      makeItem({position: 2, topicId: "writing", questionType: "essay", difficulty: "medium"}, {...common, questionId: "essay", topicId: "writing", questionText: "Frozen essay task", wordCountRequirement: {minWords: 2}}, "reused", "Writing"),
      makeItem({position: 3, topicId: "vocabulary", questionType: "fillInTheBlanks", difficulty: "medium"}, {...common, grade: 4, passageId: "passage", topicId: "vocabulary", passageText: "We saw {{q1}} at the {{q2}}.",
        questions: [{questionId: "q1", position: 1, requiredWordCount: 1, correctAnswer: "birds"}, {questionId: "q2", position: 2, requiredWordCount: 1, correctAnswer: "park"}]}, "reused", "Vocabulary"),
    ]);
    const root = db.doc("subjectAssessments/" + assessmentId), batch = db.batch();
    batch.set(root, {studentId: "student", syllabusId: "english", language: "English", itemCount: 3, contextSnapshot: {level: "primary", grade: 4, subject: "English"}});
    for (const item of items) {batch.set(root.collection("items").doc(slotId(item.position)), publicItem(item)); batch.set(root.collection("private").doc(slotId(item.position)), {marking: clean(item.marking)});}
    await batch.commit();
  }
  const answers = [{position: 1, selectedOption: "b"}, {position: 2, answer: "  I visited the park.\n"}, {position: 3, answers: {q1: "birds", q2: "garden"}}];
  async function submit(assessmentId) {await createPaper(assessmentId); return api.submitSubjectAssessment({assessmentId, expectedRevision: 0, answers}, student);}
  async function snapshotRegular() {
    const roots = ["studentPractices", "studentEssayPractices", "studentFillInTheBlanksPractices", "practiceResults", "essayResults", "fillInTheBlanksPracticeResults", "studentAssessmentProgress", "studentDailyMissions", "studentReadiness", "rewards", "studentSubjectAssessmentUsage"];
    const result = {};
    async function walk(collection) {for (const doc of (await collection.get()).docs) {result[doc.ref.path] = JSON.stringify(doc.data()); for (const child of await doc.ref.listCollections()) await walk(child);}}
    for (const root of roots) await walk(db.collection(root));
    return result;
  }
  await db.doc("rewards/student").set({coins: 9});
  await db.doc("essayResults/student/questions/existing").set({score: 50});
  await db.doc("studentSubjectAssessmentUsage/student/items/content").set({assessmentId: "existing"});
  const regularBefore = await snapshotRegular();

  await t.test("ownership and linked guardian reads; only student/admin can write", async () => {
    await createPaper("main");
    assert.equal((await api.getSubjectAssessmentSession({assessmentId: "main"}, guardian)).canSubmit, false);
    assert.equal((await api.getSubjectAssessmentSession({assessmentId: "main"}, administrator)).canSubmit, true);
    await assert.rejects(api.getSubjectAssessmentSession({assessmentId: "main"}, {auth: {uid: "stranger"}}), {code: "permission-denied"});
    await assert.rejects(api.saveSubjectAssessmentAnswers({assessmentId: "main", expectedRevision: 0, answers}, guardian), {code: "permission-denied"});
    await assert.rejects(api.listStudentSubjectAssessments({studentId: "student"}, {auth: {uid: "stranger"}}), {code: "permission-denied"});
    await assert.rejects(api.getSubjectAssessmentSession({assessmentId: "main"}, {}), {code: "unauthenticated"});
    await db.doc("subscriptions/student").set({applicationStatus: "suspended"});
    await assert.rejects(api.getSubjectAssessmentSession({assessmentId: "main"}, student), {code: "permission-denied"});
    await assert.rejects(api.getSubjectAssessmentSession({assessmentId: "main"}, guardian), {code: "permission-denied"});
    await db.doc("subscriptions/student").delete();
  });
  await t.test("drafts resume, stale revisions fail, and submission freezes original answers/settings", async () => {
    const saved = await api.saveSubjectAssessmentAnswers({assessmentId: "main", expectedRevision: 0, answers}, student);
    assert.equal(saved.revision, 1); assert.equal((await api.getSubjectAssessmentSession({assessmentId: "main"}, student)).submission.items[1].answer, answers[1].answer);
    await assert.rejects(api.saveSubjectAssessmentAnswers({assessmentId: "main", expectedRevision: 0, answers: []}, student), {code: "aborted"});
    const submitted = await api.submitSubjectAssessment({assessmentId: "main", expectedRevision: 1, answers: []}, student);
    assert.equal(submitted.status, "submitted");
    const repeated = await api.submitSubjectAssessment({assessmentId: "main", expectedRevision: 0, answers: [{position: 1, selectedOption: "a"}]}, student);
    assert.equal(repeated.items[0].selectedOption, "b");
    await assert.rejects(api.saveSubjectAssessmentAnswers({assessmentId: "main", expectedRevision: 2, answers: []}, student), {code: "failed-precondition"});
    assert.equal(await api.getSubjectAssessmentResult({assessmentId: "main"}, student), null);
    settingsVersion = "Changed instructions";
    await db.doc("syllabuses/english").set({year: 6});
    await db.doc("essayQuestionGenerator/primary/standards/4/languages/english/questions/essay").set({questionText: "Changed pool task"});
  });
  await t.test("all formats mark from snapshots, publish breakdowns, and remain idempotent", async () => {
    const result = await api.markSubjectAssessmentSubmission("main");
    assert.equal(result.score, expectedScore); assert.equal(result.questionCount, 4); assert.equal(result.itemCount, 3);
    assert.equal(result.scoringPolicy.aggregation, "topic"); assert.equal(result.scoringPolicy.version, 2);
    assert.equal(result.items[1].answer.answer, answers[1].answer); assert.equal(result.items[1].answer.corrections.length, 1);
    assert.equal(result.items[2].answer.answers.q1.markingMethod, "static");
    assert.equal(result.items[2].answer.answers.q2.markingMethod, "llm");
    assert.equal(result.topicBreakdown.find(item => item.topicId === "writing").score, 80);
    assert.equal(essayCalls, 1); assert.equal(passageCalls, 1);
    assert.equal((await api.getSubjectAssessmentResult({assessmentId: "main"}, guardian)).score, expectedScore);
    await api.markSubjectAssessmentSubmission("main"); assert.equal(essayCalls, 1);
    assert.equal((await api.listStudentSubjectAssessmentResults({studentId: "student"}, student)).results.length, 1);
  });
  await t.test("failed marking retains completed marks; retry reuses frozen settings and locked answers", async () => {
    settingsVersion = "Original instructions"; await submit("retry");
    failPassage = true; const before = essayCalls;
    await assert.rejects(api.markSubjectAssessmentSubmission("retry"), /Provider error/);
    const failed = await api.getSubjectAssessmentSession({assessmentId: "retry"}, student);
    assert.equal(failed.submission.markingStatus, "failed"); assert.equal(failed.submission.markedItemCount, 2); assert.equal(failed.result, null);
    assert.doesNotMatch(failed.submission.errorMessage, /private details/);
    settingsVersion = "Changed instructions"; failPassage = false;
    await api.retrySubjectAssessmentMarking({assessmentId: "retry"}, student);
    const result = await api.markSubjectAssessmentSubmission("retry");
    assert.equal(result.score, expectedScore); assert.equal(essayCalls, before + 1, "Successful essay is not marked again");
    assert.equal((await db.doc("subjectAssessmentSubmissions/retry").get()).data().markingRequest, 2);
  });
  await t.test("unanswered items score zero without model calls", async () => {
    await createPaper("empty");
    await api.submitSubjectAssessment({assessmentId: "empty", expectedRevision: 0, answers: []}, student);
    const before = [essayCalls, passageCalls], result = await api.markSubjectAssessmentSubmission("empty");
    assert.equal(result.score, 0); assert.equal(result.questionCount, 4); assert.deepEqual([essayCalls, passageCalls], before);
  });
  await t.test("invalid saved blank answers cannot lock a submission or queue marking", async () => {
    await createPaper("invalid");
    await api.saveSubjectAssessmentAnswers({assessmentId: "invalid", expectedRevision: 0, answers: [{position: 3, answers: {q1: "two words"}}]}, student);
    await assert.rejects(api.submitSubjectAssessment({assessmentId: "invalid", expectedRevision: 1, answers: []}, student), /requires 1 word/);
    assert.equal((await db.doc("subjectAssessmentSubmissions/invalid").get()).data().status, "draft");
    assert.equal((await db.doc("subjectAssessmentSubmissions/invalid/private/marking").get()).exists, false);
  });
  await t.test("duplicate workers cannot overlap; long jobs continue from checkpoints", async () => {
    settingsVersion = "Original instructions"; await submit("concurrent");
    let release; essayGate = new Promise(resolve => {release = resolve;});
    const gateEntered = new Promise(resolve => {entered = resolve;});
    const running = api.markSubjectAssessmentSubmission("concurrent"); await gateEntered;
    await assert.rejects(api.markSubjectAssessmentSubmission("concurrent"), {code: "marking-in-progress"});
    release(); await running; essayGate = null;
    await submit("continuation");
    const incremental = createSubjectAssessmentFeature({...dependencies, maxRunMs: -1});
    assert.deepEqual(await incremental.markSubjectAssessmentSubmission("continuation"), {queued: true});
    assert.equal(await incremental.markSubjectAssessmentSubmission("continuation", {markingRequest: 1}), null, "Old trigger requests are ignored");
    assert.deepEqual(await incremental.markSubjectAssessmentSubmission("continuation"), {queued: true});
    assert.equal((await incremental.markSubjectAssessmentSubmission("continuation")).score, expectedScore);
  });
  await t.test("an expired lease can be replaced and a stale worker cannot alter the result", async () => {
    await submit("lease"); let clock = Date.now();
    const submissions = new Submissions({now: () => clock});
    const scoped = createSubjectAssessmentFeature({...dependencies, submissions});
    const state = await submissions.claimMarking("lease");
    clock += 5 * 60 * 1000;
    await scoped.retrySubjectAssessmentMarking({assessmentId: "lease"}, student);
    await assert.rejects(submissions.saveMarkedItem(state, {position: 1}), {code: "marking-lease-lost"});
    assert.equal((await scoped.markSubjectAssessmentSubmission("lease")).score, expectedScore);
  });
  await t.test("two tabs cannot overwrite each other's answers", async () => {
    await createPaper("tabs");
    const attempts = await Promise.allSettled(["a", "b"].map(selectedOption => api.saveSubjectAssessmentAnswers({assessmentId: "tabs", expectedRevision: 0, answers: [{position: 1, selectedOption}]}, student)));
    assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(attempts.find(item => item.status === "rejected").reason.code, "aborted");
  });
  await t.test("result/submission schemas match browser and normal practice state stays unchanged", async () => {
    for (const name of ["subject_assessment_submission", "subject_assessment_result"]) {
      const server = require("./schema/" + name + "_schema"), web = await import("../public/config/firebase/" + name + "_schema.js");
      for (const key of Object.keys(server)) assert.deepEqual(web[key], server[key]);
    }
    assert.deepEqual(await snapshotRegular(), regularBefore);
    assert.equal((await new Assessments().getResult("main")).items.length, 3);
  });
});
