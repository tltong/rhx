import assert from "node:assert/strict";
import test from "node:test";

import {
  CompletionProcessingRefreshController
} from "./completion_processing_refresh_controller.js";

const statuses = Object.freeze({
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed"
});
const stages = Object.freeze({
  ASSESSING: "assessing",
  GENERATING: "generating"
});

function createController({refreshDashboard = async () => {}} = {}) {
  const statusUpdates = [];
  const refreshes = [];
  let cleared = 0;
  const activity = [];
  let unsubscribed = 0;
  let observer = null;
  const controller = new CompletionProcessingRefreshController({
    watchPracticeCompletionProcessing(input) {
      observer = input;
      return () => {
        unsubscribed += 1;
      };
    },
    async refreshDashboard(input) {
      refreshes.push(input);
      await refreshDashboard(input);
    },
    clearCompletionContext() {
      cleared += 1;
    },
    setStatus(message, options = {}) {
      statusUpdates.push({message, options});
    },
    setProcessingActive(active, identity) {
      activity.push({active, identity});
    },
    statuses,
    stages
  });

  return {
    controller,
    getObserver: () => observer,
    refreshes,
    statusUpdates,
    getCleared: () => cleared,
    getUnsubscribed: () => unsubscribed,
    activity
  };
}

test("completed processing refreshes the dashboard and stops listening", async () => {
  const fixture = createController();

  fixture.controller.start({
    studentId: "student-1",
    practiceId: "practice-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  });
  await fixture.controller.handleChange({
    status: "processing",
    stage: "generating"
  });
  assert.match(fixture.statusUpdates.at(-1).message, /next practice/);

  await fixture.controller.handleChange({
    status: "completed",
    stage: "completed"
  });

  assert.deepEqual(fixture.refreshes, [{
    studentId: "student-1",
    practiceId: "practice-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  }]);
  assert.equal(fixture.getCleared(), 1);
  assert.equal(fixture.getUnsubscribed(), 1);
  assert.deepEqual(fixture.activity, [
    {active: false, identity: null},
    {
      active: true,
      identity: {
        studentId: "student-1",
        practiceId: "practice-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1"
      }
    },
    {
      active: false,
      identity: {
        studentId: "student-1",
        practiceId: "practice-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1"
      }
    }
  ]);
  assert.equal(
    fixture.statusUpdates.at(-1).message,
    "Your dashboard is up to date."
  );
});

test("failed processing refreshes any saved readiness and retains its completion context", async () => {
  const fixture = createController();

  fixture.controller.start({
    studentId: "student-1",
    practiceId: "practice-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  });
  await fixture.controller.handleChange({
    status: "failed",
    stage: "failed"
  });

  assert.deepEqual(fixture.refreshes, [{
    studentId: "student-1", practiceId: "practice-1",
    syllabusId: "syllabus-1", topicId: "topic-1"
  }]);
  assert.equal(fixture.getCleared(), 0);
  assert.equal(fixture.getUnsubscribed(), 1);
  assert.deepEqual(fixture.activity.map(({active}) => active), [
    false,
    true,
    false
  ]);
  assert.equal(fixture.statusUpdates.at(-1).options.isError, true);
});

for (const terminalStatus of ["completed", "failed"]) {
  test(`${terminalStatus} processing refreshes saved readiness once and waits before clearing activity`, async () => {
    let finishRefresh;
    let displayedScore = 40;
    const fixture = createController({refreshDashboard: async () => {
      await new Promise((resolve) => { finishRefresh = resolve; });
      displayedScore = 85;
    }});
    fixture.controller.start({
      studentId: "student-1", practiceId: "practice-1",
      syllabusId: "syllabus-1", topicId: "topic-1"
    });
    const refresh = fixture.controller.handleChange({status: terminalStatus});
    await fixture.controller.handleChange({status: terminalStatus});
    assert.equal(displayedScore, 40);
    assert.equal(fixture.refreshes.length, 1);
    assert.equal(fixture.activity.at(-1).active, true);
    finishRefresh();
    await refresh;
    assert.equal(displayedScore, 85);
    assert.equal(fixture.activity.at(-1).active, false);
    assert.equal(fixture.getCleared(), terminalStatus === "completed" ? 1 : 0);
    assert.equal(fixture.getUnsubscribed(), 1);
  });

  test(`${terminalStatus} refresh failures retain completion context and show the error`, async () => {
    const fixture = createController({refreshDashboard: async () => { throw new Error("refresh failed"); }});
    fixture.controller.start({
      studentId: "student-1", practiceId: "practice-1",
      syllabusId: "syllabus-1", topicId: "topic-1"
    });
    await fixture.controller.handleChange({status: terminalStatus});
    assert.equal(fixture.getCleared(), 0);
    assert.equal(fixture.activity.at(-1).active, false);
    assert.equal(fixture.statusUpdates.at(-1).options.isError, true);
    assert.match(fixture.statusUpdates.at(-1).message, /refresh failed/);
    if (terminalStatus === "failed") {
      assert.match(fixture.statusUpdates.at(-1).message, /processing did not finish/);
    }
  });
}
