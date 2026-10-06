import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  unpauseTopic
} from "./daily_mission_module.js";

const gatewayUrl = new URL(
  "./infrastructure/firebase_callable_daily_mission_gateway.js",
  import.meta.url
);
const repositoryUrl = new URL(
  "./infrastructure/firestore_daily_mission_repository.js",
  import.meta.url
);

test("web Daily Mission exposes unpauseTopic without a callable", async () => {
  const [gatewaySource, repositorySource] = await Promise.all([
    readFile(gatewayUrl, "utf8"),
    readFile(repositoryUrl, "utf8")
  ]);

  assert.equal(typeof unpauseTopic, "function");
  assert.doesNotMatch(gatewaySource, /["']unpauseTopic["']/);
  assert.match(repositorySource, /async unpauseTopic/);
});
