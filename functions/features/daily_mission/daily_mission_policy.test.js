const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PAUSED_TOPIC_VALIDITY_DAYS,
  isPausedTopicExpired,
  pausedTopicAgeInDays,
} = require("./domain/daily_mission_policy");

test("paused topic remains valid through the configured boundary", () => {
  assert.equal(PAUSED_TOPIC_VALIDITY_DAYS, 14);
  assert.equal(
    pausedTopicAgeInDays("2026-09-01", "2026-09-15"),
    PAUSED_TOPIC_VALIDITY_DAYS,
  );
  assert.equal(
    isPausedTopicExpired("2026-09-01", "2026-09-15"),
    false,
  );
});

test("paused topic expires after the configured boundary", () => {
  assert.equal(
    pausedTopicAgeInDays("2026-09-01", "2026-09-16"),
    PAUSED_TOPIC_VALIDITY_DAYS + 1,
  );
  assert.equal(
    isPausedTopicExpired("2026-09-01", "2026-09-16"),
    true,
  );
});
