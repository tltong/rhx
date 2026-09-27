const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index exports pauseCoreDailyMission", () => {
  assert.equal(
    typeof require("./index").pauseCoreDailyMission,
    "function",
  );
});
