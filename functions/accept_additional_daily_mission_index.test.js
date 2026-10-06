const assert = require("node:assert/strict");
const test = require("node:test");

test("Functions index does not publish acceptAdditionalDailyMission", () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      require("./index"),
      "acceptAdditionalDailyMission",
    ),
    false,
  );
});
