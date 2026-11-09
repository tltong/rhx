const {test} = require("node:test"), assert = require("node:assert/strict");

test("subject assessment Tutor uses published wrong-MCQ snapshots and current access/configuration", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const db = require("./utils/firebase/firebase_ops").getFirestoreDb();
  const {createSubjectAssessmentFeature} = require("./features/subject_assessment/subject_assessment_module");
  const {createAssessmentAuthorizer} = require("./features/subject_assessment/infrastructure/access");
  const {isTopicTutorEnabled} = require("./features/syllabus/syllabus_module");
  const {slotId} = require("./features/subject_assessment/domain/subject_assessment");
  const {tutorQuestionId} = require("./features/subject_assessment/domain/subject_assessment_tutor");
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(reset.status, 200);
  const student = {auth: {uid: "student"}}, guardian = {auth: {uid: "guardian"}}, admin = {auth: {uid: "admin"}};
  const authorize = createAssessmentAuthorizer({getDb: () => db, getUser: async uid => ({uid, email: uid + "@example.test", emailVerified: true}), isAdministrator: async email => email === "admin@example.test"});
  let checks = [], policyUnavailable = false;
  const api = createSubjectAssessmentFeature({authorize, isTopicTutorEnabled: async (syllabus, topic) => {
    checks.push(topic); if (policyUnavailable) throw new Error("Configuration unavailable");
    return isTopicTutorEnabled(syllabus, topic);
  }});
  await db.doc("guardianStudentLinks/guardian__student").set({state: "active"});
  await db.doc("syllabuses/english").set({country: "Malaysia", level: "primary", year: 4, subject: "English", languages: ["English"]});
  await db.doc("syllabuses/english/topics/reading").set({topicName: "Reading", tutorEnabled: true});
  await db.doc("syllabuses/english/topics/disabled").set({topicName: "Disabled", tutorEnabled: false});
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>A = 60°</text></svg>';
  const paper = {studentId: "student", syllabusId: "english", language: "English", itemCount: 6};
  const contentSnapshot = {questionText: "Frozen original question", options: {a: "One", b: "Two", c: "Three", d: "Four"}, hasDiagram: true, svg, specialInstruction: "Use the diagram."};
  const items = [1, 2, 3, 4, 5, 6].map(position => ({position, topicId: position === 4 ? "disabled" : "reading", topicName: "Reading", questionType: position === 5 ? "essay" : position === 6 ? "fillInTheBlanks" : "normal", difficulty: "medium", sourceReference: "questions/deleted-pool-item", contentSnapshot}));
  const result = {...paper, score: 20, scoringPolicy: {version: 2, aggregation: "topic"}};
  const marked = items.map(item => ({position: item.position, questionType: item.questionType, score: item.position === 3 ? 100 : 0,
    answer: {selectedOption: item.position === 2 ? null : item.position === 3 ? "b" : "a", correctAnswer: "b", explanation: "Frozen marking explanation", isCorrect: item.position === 3}}));
  for (const assessmentId of ["complete", "staging"]) {
    const batch = db.batch(); batch.set(db.doc("subjectAssessments/" + assessmentId), paper);
    for (const item of items) batch.set(db.doc(`subjectAssessments/${assessmentId}/items/${slotId(item.position)}`), item);
    for (const item of marked) batch.set(db.doc(`subjectAssessmentResults/${assessmentId}/items/${slotId(item.position)}`), item);
    if (assessmentId === "complete") batch.set(db.doc("subjectAssessmentResults/" + assessmentId), result);
    await batch.commit();
  }
  const select = position => ({assessmentId: "complete", position});
  async function snapshot() {
    const saved = {};
    async function walk(collection) {for (const doc of (await collection.get()).docs) {saved[doc.ref.path] = doc.data(); for (const child of await doc.ref.listCollections()) await walk(child);}}
    for (const root of ["subjectAssessments", "subjectAssessmentResults", "subjectAssessmentSubmissions", "studentAssessmentProgress", "rewards", "tutor"]) await walk(db.collection(root));
    return saved;
  }
  const before = await snapshot();
  await t.test("only wrong/unanswered MCQs expose Tutor, checking a topic once per result", async () => {
    checks = [];
    const session = await api.getSubjectAssessmentSession({assessmentId: "complete"}, student);
    assert.deepEqual(session.assessment.items.map(item => item.tutorEnabled), [true, true, false, false, false, false]);
    assert.deepEqual(checks.sort(), ["disabled", "reading"]);
    assert.equal(session.assessment.items[0].tutorQuestionId, await tutorQuestionId("complete", 1));
    assert.notEqual(session.assessment.items[0].tutorQuestionId, session.assessment.items[1].tutorQuestionId);
    assert.notEqual(await tutorQuestionId("complete", 1), await tutorQuestionId("staging", 1));
    for (const position of [1, 2]) {
      const question = await api.getSubjectAssessmentTutorQuestion(select(position), student);
      assert.equal(question.questionText, contentSnapshot.questionText); assert.deepEqual(question.options, contentSnapshot.options);
      assert.equal(question.svg, svg); assert.equal(question.correctAnswer, "b"); assert.equal(question.explanation, "Frozen marking explanation");
      assert.equal(question.tutorEnabled, true); assert.equal("studentId" in question, false);
    }
    for (const position of [3, 5, 6]) await assert.rejects(() => api.getSubjectAssessmentTutorQuestion(select(position), student), {code: "failed-precondition"});
    assert.equal((await api.getSubjectAssessmentTutorQuestion(select(4), student)).tutorEnabled, false);
  });
  await t.test("unpublished staged answers are inaccessible", async () => {
    await assert.rejects(() => api.getSubjectAssessmentTutorQuestion({assessmentId: "staging", position: 1}, student), {code: "failed-precondition"});
    const session = await api.getSubjectAssessmentSession({assessmentId: "staging"}, student);
    assert.equal(session.result, null); assert.equal(session.assessment.items.some(item => item.tutorEnabled), false);
  });
  await t.test("ownership and subscription access apply to direct Tutor requests", async () => {
    for (const context of [guardian, admin]) assert.equal((await api.getSubjectAssessmentTutorQuestion(select(1), context)).tutorEnabled, true);
    await assert.rejects(() => api.getSubjectAssessmentTutorQuestion(select(1), {}), {code: "unauthenticated"});
    await assert.rejects(() => api.getSubjectAssessmentTutorQuestion(select(1), {auth: {uid: "stranger"}}), {code: "permission-denied"});
    await db.doc("subscriptions/student").set({applicationStatus: "suspended"});
    await assert.rejects(() => api.getSubjectAssessmentTutorQuestion(select(1), student), {code: "permission-denied"});
    await db.doc("subscriptions/student").delete();
    for (const input of [{...select(1), studentId: "student"}, {...select(1), correctAnswer: "a"}, {...select(1), position: -1}, {...select(1), position: "1"}]) {
      await assert.rejects(() => api.getSubjectAssessmentTutorQuestion(input, student), {code: "invalid-argument"});
    }
  });
  await t.test("current topic switch overrides saved results and policy failures leave scores readable", async () => {
    await db.doc("syllabuses/english/topics/reading").update({tutorEnabled: false});
    assert.equal((await api.getSubjectAssessmentTutorQuestion(select(1), student)).tutorEnabled, false);
    assert.equal((await api.getSubjectAssessmentSession({assessmentId: "complete"}, student)).assessment.items.some(item => item.tutorEnabled), false);
    await db.doc("syllabuses/english/topics/reading").update({tutorEnabled: true});
    policyUnavailable = true;
    const session = await api.getSubjectAssessmentSession({assessmentId: "complete"}, student);
    assert.equal(session.result.score, 20); assert.equal(session.assessment.items.some(item => item.tutorEnabled), false);
    await assert.rejects(() => api.getSubjectAssessmentTutorQuestion(select(1), student), /Configuration unavailable/);
  });
  assert.deepEqual(await snapshot(), before, "Tutor reads never alter results, assessments, regular progress or rewards");
});
