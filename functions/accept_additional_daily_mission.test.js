const assert = require("node:assert/strict");
const test = require("node:test");

const dailyMissionCallables = require("./daily_mission");

test("Daily Mission publishes no callable additional acceptance adapter", () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      dailyMissionCallables,
      "acceptAdditionalDailyMission",
    ),
    false,
  );
});
