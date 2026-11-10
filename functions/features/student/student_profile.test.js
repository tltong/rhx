const {test} = require("node:test"), assert = require("node:assert/strict");
const {profileView, username, currentGrade, inputObject} = require("./domain/student_profile");
const {createStudentProfileHandler} = require("../../student_profile");
test("student profile responses omit legacy PINs and internal credential locks", () => {
  const view = profileView({name: "Student", pin: "123456", credentialChangeId: "secret-operation"}, "fixed-uid");
  assert.equal(view.id, "fixed-uid"); assert.equal(view.profileVersion, 0); assert.equal(view.schoolId, null);
  assert.equal(view.credentialChangePending, true); assert.equal(view.pin, undefined); assert.equal(view.credentialChangeId, undefined);
});
test("profile contracts normalize usernames and retain registration history for grade corrections", () => {
  assert.equal(username("  NEW.Name  "), "new.name");
  assert.throws(() => username("a@b"), {code: "invalid-argument"});
  assert.throws(() => inputObject({pin: "123456"}, ["name"]), {code: "invalid-argument"});
  const student = {yearOfRegistration: 2020, standardAtYearOfRegistration: "1", academicReferenceYear: 2026, gradeAtReferenceYear: 4};
  assert.equal(currentGrade(student, new Date("2026-11-10")), 4);
});
test("student callable exposes only public actions and derives identity from authentication", async () => {
  let received;
  const handler = createStudentProfileHandler({apis: {
    isStudentUsernameAvailable: async () => ({available: true}),
    getStudentProfile: async (...args) => {received = args; return {id: "student"};},
  }});
  assert.deepEqual(await handler({data: {action: "isStudentUsernameAvailable", input: {username: "new-name"}}}), {available: true});
  await assert.rejects(handler({data: {action: "getStudentProfile"}}), {code: "unauthenticated"});
  for (const action of ["constructor", "processStudentUsernameChange", "retryStudentUsernameChanges"]) await assert.rejects(handler({auth: {uid: "admin"}, data: {action}}), {code: "invalid-argument"});
  await handler({auth: {uid: "admin"}, data: {action: "getStudentProfile", input: {studentId: "student", actor: "forged"}}});
  assert.deepEqual(received[1], {auth: {uid: "admin"}});
});
