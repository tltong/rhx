const {test} = require("node:test"), assert = require("node:assert/strict");
const {subscriptionKey} = require("./domain/student_subject_assessment");
const {processSubscribedSubjectAssessment, onSubjectAssessmentSubscriptionCreated} = require("../../triggers/subscribed_subject_assessment_trigger");
const {StudentSubjectAssessmentService} = require("./application/student_subject_assessment_service");

test("subscription trigger queues active creates only and preserves timestamp precision", async () => {
  assert.match(onSubjectAssessmentSubscriptionCreated.__endpoint.eventTrigger.eventType, /\.created$/);
  assert.equal(onSubjectAssessmentSubscriptionCreated.__endpoint.eventTrigger.retry, true);
  const calls = [], prepare = async input => {calls.push(input); return {status: "generating"};};
  const snapshot = {exists: true, createTime: {seconds: 123, nanoseconds: 456}, data: () => ({state: "active"})};
  const event = {type: "google.cloud.firestore.document.v1.created", params: {studentId: "student", syllabusId: "chinese"}, data: snapshot};
  assert.equal(subscriptionKey(snapshot), "123:456");
  assert.notEqual(subscriptionKey(snapshot), subscriptionKey({...snapshot, createTime: {seconds: 123, nanoseconds: 457}}));
  assert.equal(subscriptionKey({exists: false}), null);
  await processSubscribedSubjectAssessment({...event, type: "google.cloud.firestore.document.v1.updated"}, {prepare});
  await processSubscribedSubjectAssessment({...event, data: {...snapshot, data: () => ({state: "inactive"})}}, {prepare});
  await processSubscribedSubjectAssessment({...event, data: {exists: false}}, {prepare});
  assert.equal(calls.length, 0);
  await processSubscribedSubjectAssessment(event, {prepare});
  assert.deepEqual(calls, [{studentId: "student", syllabusId: "chinese", subscriptionKey: "123:456"}]);
  await assert.rejects(processSubscribedSubjectAssessment({...event, data: {...snapshot, createTime: null}}, {prepare}), /creation timestamp/);
  await assert.rejects(processSubscribedSubjectAssessment(event, {prepare: async () => {throw new Error("Temporary database failure");}}), /Temporary database failure/);
});

test("subscription preparation derives the student's current scope and stable request ID", async () => {
  const calls = [];
  const service = new StudentSubjectAssessmentService({authorize: async ({studentId}, context) => {assert.equal(studentId, "student"); assert.equal(context.auth.uid, "student"); return {uid: "student"};},
    listSubjects: async () => [{syllabusId: "chinese", language: "English"}],
    repository: {subscribedSubjects: async () => [{syllabusId: "chinese", language: "Chinese"}], start: async (...args) => {calls.push(args); return {status: "generating"};}}});
  const input = {studentId: "student", syllabusId: "chinese", subscriptionKey: "123:456"};
  await service.prepareSubscription(input); await service.prepareSubscription(input);
  await service.prepareSubscription({...input, subscriptionKey: "123:457"});
  assert.equal(calls[0][1].language, "Chinese"); assert.equal(calls[0][2], calls[1][2]); assert.notEqual(calls[0][2], calls[2][2]);
  assert.deepEqual(calls[0][4], {automatic: true, subscriptionKey: "123:456"});
  assert.deepEqual(await service.prepareSubscription({...input, syllabusId: "foreign"}), {status: "skipped", reason: "subscriptionUnavailable"});
});

test("unavailable student access is skipped while transient authorization errors retry", async () => {
  for (const code of ["permission-denied", "auth/user-not-found", "auth/user-disabled", "unavailable"]) {
    const service = new StudentSubjectAssessmentService({authorize: async () => {throw Object.assign(new Error("Access failure"), {code});}});
    const task = service.prepareSubscription({studentId: "student", syllabusId: "chinese", subscriptionKey: "123:456"});
    if (code === "unavailable") await assert.rejects(task, {code});
    else assert.deepEqual(await task, {status: "skipped", reason: "studentUnavailable"});
  }
});
