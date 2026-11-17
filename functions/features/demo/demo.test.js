const {test} = require("node:test");
const assert = require("node:assert/strict");
const d = require("./domain/demo");
const {createDemoHandler, processDemoPractice} = require("../../demo");

test("demo capabilities, difficulty and question-count validation reject malformed input", () => {
  for (const input of [null, "", "student-id", "../arbitrary", "x".repeat(129)]) assert.throws(() => d.sessionId(input));
  assert.equal(d.sessionId("a".repeat(43)).length, 64);
  for (const questionCount of [0, -1, 1.5, 101, Infinity, "5"]) assert.throws(() => d.mcqChoices({questionCount, difficulty: "medium"}));
  assert.throws(() => d.mcqChoices({questionCount: 5, difficulty: "unknown"}));
  for (const difficulty of [null, "", "unknown", 1]) assert.throws(() => d.difficulty(difficulty));
  assert.throws(() => d.fields({studentId: "another-student"}, []));
});
test("practice responses never expose private answer keys before submission", () => {
  const privateQuestion = {id: "q", questionText: "Question", options: {a: "One", b: "Two"}, correctAnswer: "a", explanation: "PRIVATE"};
  const mcq = d.publicAttempt({questions: [privateQuestion]});
  assert.equal(JSON.stringify(mcq).includes("PRIVATE"), false);
  assert.equal(Object.hasOwn(mcq.questions[0], "correctAnswer"), false);
  const fill = d.publicAttempt({passage: {passageText: "{{q1}}", questions: [{questionId: "q1", correctAnswer: "SECRET", acceptedAnswers: ["SECRET"]}]}});
  assert.equal(JSON.stringify(fill).includes("SECRET"), false);
});
test("public demo handler has a strict allowlist and accepts a guest capability without login", async () => {
  const handler = createDemoHandler({getFeature: () => ({startDemo: async (token, input) => ({tokenAccepted: !!token, input, date: new Date("2026-11-15")})})});
  const response = await handler({data: {action: "startDemo", token: "x".repeat(43), input: {}}});
  assert.equal(response.tokenAccepted, true); assert.equal(typeof response.date, "string");
  await assert.rejects(handler({data: {action: "runPractice", token: "x".repeat(43)}}), {code: "invalid-argument"});
  await assert.rejects(handler({data: {action: "startDemo", token: "x".repeat(43), actor: "administrator"}}), {code: "invalid-argument"});
});
test("worker ignores deletes, running updates and duplicate deliveries", async () => {
  let calls = 0; const getFeature = () => ({runPractice: async () => {calls++;}});
  const data = value => ({data: () => value});
  for (const [before, after] of [[{}, null], [{}, {status: "running", requestSequence: 1}], [{requestSequence: 1}, {status: "queued", requestSequence: 1}]]) {
    await processDemoPractice({data: {before: data(before), after: data(after)}, params: {}}, {getFeature});
  }
  assert.equal(calls, 0);
  await processDemoPractice({data: {before: data({}), after: data({status: "queued", requestSequence: 1})}, params: {sessionId: "run", attemptId: "practice"}}, {getFeature});
  assert.equal(calls, 1);
});
