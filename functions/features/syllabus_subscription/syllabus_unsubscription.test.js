const {test} = require("node:test"), assert = require("node:assert/strict");
const {createUnsubscriptionAuthorizer} = require("./infrastructure/syllabus_unsubscription_access");
const {UnsubscribeStudentSyllabus} = require("./application/unsubscribe_student_syllabus");
const {createUnsubscribeStudentSyllabusHandler} = require("../../syllabus_subscription");
const {processSyllabusUnsubscriptionCleanup} = require("../../triggers/syllabus_unsubscription_cleanup_trigger");

test("unsubscription permits only an enabled administrator or an actively linked guardian", async () => {
  const records = new Map([["guardians/guardian", {}], ["guardianStudentLinks/guardian__student", {state: "active"}],
    ["guardians/inactive", {}], ["guardianStudentLinks/inactive__student", {state: "inactive"}]]);
  const authorize = createUnsubscriptionAuthorizer({getDb: () => ({doc: path => ({get: async () => ({exists: records.has(path), data: () => records.get(path)})})}),
    getUser: async uid => ({uid, email: uid + "@example.test", emailVerified: uid !== "unverified", disabled: uid === "disabled"}),
    isAdministrator: async email => ["admin@example.test", "unverified@example.test", "disabled@example.test"].includes(email)});
  await assert.rejects(authorize("student", {}), {code: "unauthenticated"});
  for (const uid of ["student", "stranger", "inactive", "unverified", "disabled"]) {
    await assert.rejects(authorize("student", {auth: {uid}}), {code: "permission-denied"});
  }
  assert.deepEqual(await authorize("student", {auth: {uid: "guardian"}}), {uid: "guardian", administrator: false});
  assert.deepEqual(await authorize("student", {auth: {uid: "admin"}}), {uid: "admin", administrator: true});
});

test("callable uses authenticated context, rejects malformed scopes and hides internal failures", async () => {
  let calls = 0;
  const useCase = new UnsubscribeStudentSyllabus({authorize: async (studentId, context) => {assert.equal(studentId, "student"); assert.equal(context.auth.uid, "guardian"); return {uid: "guardian"};},
    repository: {begin: async scope => {calls++; return scope;}, clean: async () => ({cleanupStatus: "completed"})}});
  const handler = createUnsubscribeStudentSyllabusHandler({execute: (input, context) => useCase.execute(input, context)});
  const input = {studentId: "student", syllabusId: "english", requestId: "request"};
  await assert.rejects(handler({data: input}), {code: "unauthenticated"});
  for (const data of [null, [], {...input, studentId: "bad/path"}, {...input, requestId: ""}, {...input, updatedBy: "admin"}]) {
    await assert.rejects(handler({auth: {uid: "guardian"}, data}), {code: "invalid-argument"});
  }
  assert.deepEqual(await handler({auth: {uid: "guardian"}, data: input, context: {auth: {uid: "admin"}}}), {cleanupStatus: "completed"});
  assert.equal(calls, 1);
  const broken = createUnsubscribeStudentSyllabusHandler({execute: async () => {throw new Error("Secret provider details");}});
  await assert.rejects(broken({auth: {uid: "guardian"}, data: input}), error => error.code === "unavailable" && !error.message.includes("Secret"));
});

test("cleanup trigger retries pending cleanup and ignores ordinary subject state updates", async () => {
  let calls = 0;
  const event = (before, after) => ({params: {studentId: "student", syllabusId: "english"}, data: {before: {data: () => before}, after: {data: () => after}}});
  const deps = {clean: async scope => {calls++; assert.equal(scope.cleanupId, "cleanup"); return {cleanupStatus: "completed"};}};
  const pending = {cleanup: {id: "cleanup", status: "pending"}};
  for (const after of [undefined, {}, {cleanup: {id: "cleanup", status: "running"}}, {cleanup: {id: "cleanup", status: "completed"}}]) {
    await processSyllabusUnsubscriptionCleanup(event({}, after), deps);
  }
  await processSyllabusUnsubscriptionCleanup(event(pending, pending), deps);
  assert.equal(calls, 0);
  await processSyllabusUnsubscriptionCleanup(event({}, pending), deps); assert.equal(calls, 1);
  await assert.rejects(processSyllabusUnsubscriptionCleanup(event({}, pending), {clean: async () => ({cleanupStatus: "pending"})}), /already running/);
});
