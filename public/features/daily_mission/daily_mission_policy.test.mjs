import assert from "node:assert/strict";
import test from "node:test";

import {
  PAUSED_TOPIC_VALIDITY_DAYS,
  isPausedTopicExpired
} from "./domain/daily_mission_policy.js";

test("web pause policy uses the same 14-day boundary", () => {
  assert.equal(PAUSED_TOPIC_VALIDITY_DAYS, 14);
  assert.equal(
    isPausedTopicExpired("2026-09-16", "2026-09-30"),
    false
  );
  assert.equal(
    isPausedTopicExpired("2026-09-15", "2026-09-30"),
    true
  );
});
