const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index exports getNextCoreDailyMission", () => {
  assert.equal(
    typeof require("./index").getNextCoreDailyMission,
    "function",
  );
});
