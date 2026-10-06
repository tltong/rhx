import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("./daily_mission_module.js", import.meta.url);
const callableGatewayUrl = new URL(
  "./infrastructure/firebase_callable_daily_mission_gateway.js",
  import.meta.url
);

test("web Daily Mission does not expose paused-topic validity as a callable", async () => {
  const [dailyMissionModule, gatewaySource] = await Promise.all([
    import(moduleUrl),
    readFile(callableGatewayUrl, "utf8")
  ]);

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      dailyMissionModule,
      "checkPausedTopicValidity"
    ),
    false
  );
  assert.doesNotMatch(
    gatewaySource,
    /["']checkPausedTopicValidity["']/
  );
});
