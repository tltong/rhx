const assert = require("node:assert/strict");
const test = require("node:test");

test("student login APIs remain feature exports alongside cleanup and the reward trigger", () => {
  const feature = require("./features/student_login/student_login_module");
  const functions = require("./index");
  for (const name of [
    "recordStudentLogin", "getStudentLoginSummary", "getStudentLoginRecord", "hasStudentLoggedInOnDate",
    "listStudentLoginHistory", "pruneStudentLoginHistory",
  ]) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
  assert.equal(typeof functions.pruneStudentLoginHistoryDaily, "function");
  assert.equal(functions.pruneStudentLoginHistoryDaily.__endpoint.scheduleTrigger.schedule, "5 0 * * *");
  assert.equal(functions.pruneStudentLoginHistoryDaily.__endpoint.scheduleTrigger.timeZone, "Etc/UTC");
  assert.equal(typeof functions.onStudentLoginRecorded, "function");
  assert.equal(functions.onStudentLoginRecorded.__endpoint.eventTrigger.eventType, "google.cloud.firestore.document.v1.created");
  assert.equal(functions.onStudentLoginRecorded.__endpoint.eventTrigger.eventFilterPathPatterns.document, "studentLogins/{studentId}/history/{loginDate}");
  assert.equal(functions.onStudentLoginRecorded.__endpoint.eventTrigger.retry, true);
  assert.equal(Object.hasOwn(functions, "awardStudentLogin"), false);
});
