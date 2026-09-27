const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index exports acceptAdditionalDailyMission", () => {
  assert.equal(
    typeof require("./index").acceptAdditionalDailyMission,
    "function",
  );
});
