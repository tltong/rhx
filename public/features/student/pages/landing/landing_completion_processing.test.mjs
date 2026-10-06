import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {runInNewContext} from "node:vm";

import {
  CompletionProcessingRefreshController
} from "./completion_processing_refresh_controller.js";

const identity = {
  studentId: "student-1",
  practiceId: "practice-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1"
};
const key = JSON.stringify([identity.syllabusId, identity.topicId]);

async function createFixture() {
  const script = await readFile(new URL("./landing.js", import.meta.url), "utf8");
  const callback = script.match(/function setTopicProcessingActive\([\s\S]*?\n}/)?.[0];

  assert.ok(callback, "The landing-page processing callback must exist.");
  const indicator = {hidden: true};
  const scope = {
    topicProcessingIndicators: new Map([[key, indicator]]),
    activeProcessingTopicKey: "",
    topicKey: (syllabusId, topicId) => JSON.stringify([syllabusId, topicId])
  };

  runInNewContext(callback, scope);
  let refreshed = 0;
  let cleared = 0;
  const controller = new CompletionProcessingRefreshController({
    watchPracticeCompletionProcessing() {
      return () => {};
    },
    async refreshDashboard() {
      refreshed += 1;
      scope.topicProcessingIndicators.set(key, {hidden: false});
    },
    clearCompletionContext() {
      cleared += 1;
    },
    setStatus() {},
    setProcessingActive: scope.setTopicProcessingActive,
    statuses: {COMPLETED: "completed", FAILED: "failed"},
    stages: {GENERATING: "generating"}
  });

  return {
    controller,
    scope,
    indicator,
    getRefreshed: () => refreshed,
    getCleared: () => cleared
  };
}

test("landing processing can stop before any practice identity exists", async () => {
  const {controller, scope, indicator} = await createFixture();

  // Auth initialization resets activity while the controller identity is null.
  scope.activeProcessingTopicKey = key;
  indicator.hidden = false;
  controller.stop();
  controller.stop();

  assert.equal(indicator.hidden, true);
  assert.equal(scope.activeProcessingTopicKey, "");
});

test("landing processing activates a topic and clears its refreshed indicator", async () => {
  const fixture = await createFixture();

  fixture.controller.start(identity);
  assert.equal(fixture.indicator.hidden, false);
  assert.equal(fixture.scope.activeProcessingTopicKey, key);
  await fixture.controller.handleChange({status: "completed"});

  assert.equal(fixture.getRefreshed(), 1);
  assert.equal(fixture.getCleared(), 1);
  assert.equal(fixture.scope.topicProcessingIndicators.get(key).hidden, true);
  assert.equal(fixture.scope.activeProcessingTopicKey, "");
});
