import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  acceptAdditionalDailyMission
} from "./daily_mission_module.js";
const moduleUrl = new URL("./daily_mission_module.js", import.meta.url);
const gatewayUrl = new URL(
  "./infrastructure/firebase_callable_daily_mission_gateway.js",
  import.meta.url
);
const repositoryUrl = new URL(
  "./infrastructure/firestore_daily_mission_repository.js",
  import.meta.url
);

test("web accepts additional missions without a callable", async () => {
  const [moduleSource, gatewaySource, repositorySource] = await Promise.all([
    readFile(moduleUrl, "utf8"),
    readFile(gatewayUrl, "utf8"),
    readFile(repositoryUrl, "utf8")
  ]);

  assert.equal(typeof acceptAdditionalDailyMission, "function");
  assert.doesNotMatch(moduleSource, /FirebaseCallableDailyMissionGateway/);
  assert.doesNotMatch(gatewaySource, /["']acceptAdditionalDailyMission["']/);
  assert.match(repositorySource, /async acceptAdditionalMission/);
});
