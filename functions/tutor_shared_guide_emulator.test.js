const {test} = require("node:test"), assert = require("node:assert/strict");

test("concurrent Tutor generation publishes one immutable shared guide for every caller", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const db = require("./utils/firebase/firebase_ops").getFirestoreDb();
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(reset.status, 200);
  await db.doc("tutor/config").set({miniQuestionCount: 2, promptInstructions: "Build understanding.", correctAnswerMessage: {English: "Correct"}, incorrectAnswerMessage: {English: "Try again"}, updatedAt: new Date(), updatedBy: "admin"});
  const llm = require("./utils/llm/llm_ops"), original = llm.generateLlmText;
  let release, entered, calls = 0;
  const gate = new Promise(resolve => {release = resolve;}), pending = new Promise(resolve => {entered = resolve;});
  llm.generateLlmText = async () => {
    const variant = ++calls; if (calls === 2) entered(); await gate;
    return {language: "English", miniQuestions: [1, 2].map(sequence => ({sequence, questionText: "Variant " + variant + " step " + sequence, expectedAnswer: String(variant), acceptedAnswers: [], answerExplanation: "One step at a time."}))};
  };
  try {
    const {createTutorReviewForQuestion} = require("./features/tutor/tutor_module");
    const source = id => ({id, questionText: "Original question", options: {a: "One", b: "Two", c: "Three", d: "Four"}, correctAnswer: "b", language: "English", difficulty: "medium", hasDiagram: false});
    const practice = createTutorReviewForQuestion(async id => source(id));
    const assessment = createTutorReviewForQuestion(async id => source(id));
    const first = practice.getTutorMiniQuestionSet({questionId: "bank-question", language: "English"});
    const second = assessment.getTutorMiniQuestionSet({questionId: "frozen-assessment-item", language: "English"});
    await pending; release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(calls, 2, "Concurrent cache misses may both finish generation");
    assert.equal(a.guideId, b.guideId); assert.deepEqual(a.miniQuestions, b.miniQuestions);
    assert.equal(+a.generatedAt, +b.generatedAt);
    const saved = await db.collectionGroup("languages").get();
    assert.equal(saved.size, 1); assert.equal(saved.docs[0].data().questionId, a.guideId);
    const later = await assessment.getTutorMiniQuestionSet({questionId: "another-assessment", language: "English"});
    assert.equal(calls, 2); assert.deepEqual(later.miniQuestions, a.miniQuestions);
    assert.equal((await assessment.checkTutorMiniQuestionAnswer({questionId: "another-assessment", guideId: a.guideId, language: "English", miniQuestionCount: 2,
      sequence: 1, answer: a.miniQuestions[0].expectedAnswer})).isCorrect, true);
    assert.equal(calls, 2);
  } finally {release(); llm.generateLlmText = original;}
});
