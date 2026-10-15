const assert = require("node:assert/strict");
const test = require("node:test");
const {processStudentLoginRecorded} = require("./student_login_reward_trigger");

test("login trigger calls the Reward API with only the document path identity", async () => {
  const result = {dailyReward: {award: {coins: 1}, alreadyAwarded: false}, streakReward: {award: {coins: 2}, alreadyAwarded: false}};
  const received = [];
  const actual = await processStudentLoginRecorded({
    id: "event-1", params: {studentId: "student-1", loginDate: "2026-10-10"},
    data: {data: () => {throw new Error("The Reward API must read the saved login record itself.");}},
  }, {awardLogin: async input => {received.push(input); return result;}});
  assert.deepEqual(received, [{studentId: "student-1", loginDate: "2026-10-10"}]);
  assert.equal(actual, result);
});

test("login trigger propagates award failures for automatic retry", async () => {
  const error = new Error("Temporary Firestore failure");
  await assert.rejects(() => processStudentLoginRecorded({
    id: "event-2", params: {studentId: "student-1", loginDate: "2026-10-10"},
    data: {data: () => ({loggedInAt: new Date(), currentStreakDays: 1})},
  }, {awardLogin: async () => {throw error;}}), value => value === error);
});

test("a login event without a document does not attempt an award", async () => {
  assert.equal(await processStudentLoginRecorded({id: "event-empty", data: null}, {
    awardLogin: async () => {assert.fail("No award expected");},
  }), null);
});
