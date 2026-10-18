const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createStudentTopicResetHandler} = require("../../student_topic_practice_reset_http");

async function invoke({method = "POST", token = "valid", user = {uid: "real-admin", email_verified: true}, body = {action: "preview", input: {}}, operation} = {}) {
  const calls = [], res = {headers: {}, set(key, value) {this.headers[key] = value;}, status(value) {this.statusCode = value; return this;}, json(value) {this.body = value;}};
  const handler = createStudentTopicResetHandler({verifyToken: async value => {
    assert.equal(value, token); if (token === "invalid") throw Object.assign(new Error("Bad token"), {code: "auth/id-token-expired"}); return user;
  }, apis: Object.fromEntries(["previewStudentTopicPracticeReset", "requestStudentTopicPracticeReset", "getStudentTopicPracticeResetStatus"].map(name => [name,
    async (input, context) => {calls.push({name, input, context}); return operation ? operation(input, context) : {ok: true};}]))});
  await handler({method, headers: token ? {authorization: "Bearer " + token} : {}, body}, res);
  return {calls, res};
}
test("admin endpoint requires POST and a verified valid ID token before invoking any feature API", async () => {
  for (const [options, code] of [[{method: "GET"}, 405], [{token: null}, 401], [{token: "invalid"}, 401], [{user: {uid: "u", email_verified: false}}, 403]]) {
    const result = await invoke(options); assert.equal(result.res.statusCode, code); assert.equal(result.calls.length, 0);
    assert.equal(result.res.headers["Cache-Control"], "no-store");
  }
});
test("endpoint derives the actor from the verified token and dispatches only supported actions", async () => {
  for (const action of ["preview", "request", "status"]) {
    const input = {studentId: "s", syllabusId: "language", topicId: "writing", updatedBy: "spoofed-admin"};
    const {res, calls} = await invoke({body: {action, input, updatedBy: "spoofed-admin"}});
    assert.equal(res.statusCode, 200); assert.deepEqual(calls[0].context, {updatedBy: "real-admin"});
    assert.deepEqual(calls[0].input, input);
  }
  for (const action of ["constructor", "__proto__", "deleteAll", null]) {
    const result = await invoke({body: {action}}); assert.equal(result.res.statusCode, 400); assert.equal(result.calls.length, 0);
  }
});
test("endpoint preserves feature admin denial, resumable IDs, conflicts and internal failure status", async () => {
  for (const [code, expected] of [["permission-denied", 403], ["reset-in-progress", 409], ["invalid-argument", 400], ["not-found", 404], [undefined, 500]]) {
    const {res} = await invoke({operation: () => {throw Object.assign(new Error("Failure"), {code, resetId: "keep-this-id"});}});
    assert.equal(res.statusCode, expected); assert.equal(res.body.error.resetId, "keep-this-id");
  }
});
