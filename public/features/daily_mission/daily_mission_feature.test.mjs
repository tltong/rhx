import assert from "node:assert/strict";
import test from "node:test";

import {
  GetNextCoreDailyMission
} from "./application/get_next_core_daily_mission.js";
import {
  getNextCoreDailyMission
} from "./daily_mission_module.js";

function practice(id, syllabusId, topicId) {
  return {
    id,
    questions: [{syllabusId, topicId, questionId: `question-${id}`}]
  };
}

function createUseCase({
  existingMission = null,
  assignedPracticeIds = [],
  acceptedAdditionalPracticeIds = [],
  practices = new Map(),
  pausedTopicIds = [],
  activePausedTopicIds = pausedTopicIds,
  topicStats = []
} = {}) {
  const calls = [];
  const dailyMissionRepository = {
    async getCoreMission(input) {
      calls.push(["existing", input]);
      return existingMission;
    },
    async listPausedTopicIds(input) {
      calls.push(["paused", input]);
      return pausedTopicIds;
    },
    async listAcceptedAdditionalPracticeIds(input) {
      calls.push(["accepted-additional", input]);
      return acceptedAdditionalPracticeIds;
    },
    async listTopicStats(input) {
      calls.push(["stats", input]);
      return topicStats;
    }
  };
  const useCase = new GetNextCoreDailyMission({
    dailyMissionRepository,
    async listAssignedPracticeIds(input) {
      calls.push(["assigned", input]);
      return assignedPracticeIds;
    },
    async getPracticeById(practiceId) {
      calls.push(["practice", practiceId]);
      return practices.get(practiceId) || null;
    },
    async checkPausedTopicValidity(input) {
      calls.push(["pause-validity", input]);
      return {
        ...input,
        pausedDate: "2026-09-01",
        isPaused: activePausedTopicIds.includes(input.topicId),
        unpaused: !activePausedTopicIds.includes(input.topicId)
      };
    },
    getCurrentDate: () => "2026-09-27"
  });

  return {calls, useCase};
}

test("daily mission module exposes the direct core mission lookup", () => {
  assert.equal(typeof getNextCoreDailyMission, "function");
});

test("web returns today's accepted core mission without selecting another", async () => {
  const {calls, useCase} = createUseCase({
    existingMission: {
      topicId: "topic-existing",
      practiceId: "practice-existing"
    }
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-existing",
    practiceId: "practice-existing",
    date: "2026-09-27",
    isAccepted: true
  });
  assert.deepEqual(calls, [["existing", {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    date: "2026-09-27"
  }]]);
});

test("web prioritizes a topic never accepted as a mission", async () => {
  const practices = new Map([
    ["practice-old", practice("practice-old", "syllabus-1", "topic-old")],
    ["practice-new", practice("practice-new", "syllabus-1", "topic-never")]
  ]);
  const {useCase} = createUseCase({
    assignedPracticeIds: [...practices.keys()],
    practices,
    topicStats: [{
      topicId: "topic-old",
      lastAcceptedDate: "2026-01-01"
    }]
  });

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  });

  assert.equal(result.topicId, "topic-never");
  assert.equal(result.practiceId, "practice-new");
  assert.equal(result.isAccepted, false);
});

test("web selects the least recently accepted eligible topic", async () => {
  const practices = new Map([
    ["practice-recent", practice(
      "practice-recent",
      "syllabus-1",
      "topic-recent"
    )],
    ["practice-oldest", practice(
      "practice-oldest",
      "syllabus-1",
      "topic-oldest"
    )],
    ["practice-paused", practice(
      "practice-paused",
      "syllabus-1",
      "topic-paused"
    )],
    ["practice-other", practice(
      "practice-other",
      "syllabus-2",
      "topic-other"
    )]
  ]);
  const {useCase} = createUseCase({
    assignedPracticeIds: [...practices.keys()],
    practices,
    pausedTopicIds: ["topic-paused"],
    topicStats: [
      {topicId: "topic-recent", lastAcceptedDate: "2026-09-26"},
      {topicId: "topic-oldest", lastAcceptedDate: "2026-08-01"},
      {topicId: "topic-paused", lastAcceptedDate: "2025-01-01"}
    ]
  });

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  });

  assert.equal(result.topicId, "topic-oldest");
  assert.equal(result.practiceId, "practice-oldest");
});

test("web unpauses expired topics before building the core pool", async () => {
  const practices = new Map([
    ["practice-expired", practice(
      "practice-expired",
      "syllabus-1",
      "topic-expired"
    )],
    ["practice-active", practice(
      "practice-active",
      "syllabus-1",
      "topic-active"
    )]
  ]);
  const {calls, useCase} = createUseCase({
    assignedPracticeIds: [...practices.keys()],
    practices,
    pausedTopicIds: ["topic-expired", "topic-active"],
    activePausedTopicIds: ["topic-active"]
  });

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  });

  assert.equal(result.topicId, "topic-expired");
  assert.deepEqual(
    calls.filter(([operation]) => operation === "pause-validity"),
    [
      ["pause-validity", {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-expired"
      }],
      ["pause-validity", {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-active"
      }]
    ]
  );
});

test("web excludes additional missions accepted today", async () => {
  const practices = new Map([
    ["practice-additional", practice(
      "practice-additional",
      "syllabus-1",
      "topic-1"
    )],
    ["practice-core", practice(
      "practice-core",
      "syllabus-1",
      "topic-2"
    )]
  ]);
  const {useCase} = createUseCase({
    assignedPracticeIds: [...practices.keys()],
    acceptedAdditionalPracticeIds: ["practice-additional"],
    practices
  });

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  });

  assert.equal(result.practiceId, "practice-core");
});

test("web keeps a stable daily practice choice within the topic", async () => {
  const practices = new Map([
    ["practice-1", practice("practice-1", "syllabus-1", "topic-1")],
    ["practice-2", practice("practice-2", "syllabus-1", "topic-1")]
  ]);
  const first = createUseCase({
    assignedPracticeIds: ["practice-1", "practice-2"],
    practices
  });
  const second = createUseCase({
    assignedPracticeIds: ["practice-2", "practice-1"],
    practices
  });
  const input = {studentId: "student-1", syllabusId: "syllabus-1"};

  assert.deepEqual(
    await first.useCase.execute(input),
    await second.useCase.execute(input)
  );
});

test("web returns null when every assigned practice is ineligible", async () => {
  const practices = new Map([
    ["practice-paused", practice(
      "practice-paused",
      "syllabus-1",
      "topic-paused"
    )],
    ["practice-other", practice(
      "practice-other",
      "syllabus-2",
      "topic-other"
    )]
  ]);
  const {useCase} = createUseCase({
    assignedPracticeIds: ["practice-paused", "practice-other", "missing"],
    practices,
    pausedTopicIds: ["topic-paused"]
  });

  assert.equal(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), null);
});
