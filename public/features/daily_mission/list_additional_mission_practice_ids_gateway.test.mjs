import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  listAdditionalMissionPracticeIds
} from "./daily_mission_module.js";

const moduleUrl = new URL("./daily_mission_module.js", import.meta.url);
const callableGatewayUrl = new URL(
  "./infrastructure/firebase_callable_daily_mission_gateway.js",
  import.meta.url
);

test("web lists additional missions without a Firebase callable", async () => {
  const [moduleSource, gatewaySource] = await Promise.all([
    readFile(moduleUrl, "utf8"),
    readFile(callableGatewayUrl, "utf8")
  ]);

  assert.equal(typeof listAdditionalMissionPracticeIds, "function");
  assert.match(moduleSource, /FirestoreDailyMissionRepository/);
  assert.match(moduleSource, /listAssignedPracticeIds/);
  assert.doesNotMatch(
    gatewaySource,
    /["']listAdditionalMissionPracticeIds["']/
  );
});
