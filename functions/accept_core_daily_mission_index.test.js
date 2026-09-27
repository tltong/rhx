const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index exports acceptCoreDailyMission", () => {
  assert.equal(
    typeof require("./index").acceptCoreDailyMission,
    "function",
  );
});
