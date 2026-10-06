import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  getNextCoreDailyMission
} from "./daily_mission_module.js";

const moduleUrl = new URL("./daily_mission_module.js", import.meta.url);
const callableGatewayUrl = new URL(
  "./infrastructure/firebase_callable_daily_mission_gateway.js",
  import.meta.url
);

test("web Daily Mission selects the next core mission without a callable", async () => {
  const [moduleSource, gatewaySource] = await Promise.all([
    readFile(moduleUrl, "utf8"),
    readFile(callableGatewayUrl, "utf8")
  ]);

  assert.equal(typeof getNextCoreDailyMission, "function");
  assert.match(moduleSource, /FirestoreDailyMissionRepository/);
  assert.match(moduleSource, /listAssignedPracticeIds/);
  assert.doesNotMatch(
    gatewaySource,
    /["']getNextCoreDailyMission["']/
  );
});
