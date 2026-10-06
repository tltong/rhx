import assert from "node:assert/strict";
import test from "node:test";

import {
  ListAdditionalMissionPracticeIds
} from "./application/list_additional_mission_practice_ids.js";

function practice(syllabusId, topicId) {
  return {
    questions: [{syllabusId, topicId, questionId: "question-1"}]
  };
}

test("web lists one additional mission per eligible topic after subject completion", async () => {
  const acceptedTopicCalls = [];
  const practices = new Map([
    ["additional-2", practice("syllabus-1", "topic-2")],
    ["core-1", practice("syllabus-1", "topic-1")],
    ["core-topic-other", practice("syllabus-1", "topic-1")],
    ["paused-1", practice("syllabus-1", "topic-paused")],
    ["accepted-1", practice("syllabus-1", "topic-3")],
    ["accepted-same-topic-2", practice("syllabus-1", "topic-3")],
    ["additional-1", practice("syllabus-1", "topic-2")],
    ["other-syllabus", practice("syllabus-2", "topic-4")]
  ]);
  const useCase = new ListAdditionalMissionPracticeIds({
    dailyMissionRepository: {
      async getCoreMission(input) {
        assert.deepEqual(input, {
          studentId: "student-1",
          syllabusId: "syllabus-1",
          date: "2026-09-27"
        });
        return {topicId: "topic-1", practiceId: "core-1"};
      },
      async isPracticeCompleted(input) {
        assert.deepEqual(input, {studentId: "student-1", practiceId: "core-1"});
        return true;
      },
      async listPausedTopicIds(input) {
        assert.deepEqual(input, {
          studentId: "student-1",
          syllabusId: "syllabus-1"
        });
        return ["topic-paused"];
      },
      async listTopicStats(input) {
        assert.deepEqual(input, {
          studentId: "student-1",
          syllabusId: "syllabus-1"
        });
        return [{topicId: "topic-1", lastAcceptedDate: "2026-09-26"}];
      },
      async listAcceptedAdditionalTopicIds(input) {
        acceptedTopicCalls.push(input);
        return ["topic-3"];
      }
    },
    async listAssignedPracticeIds() {
      return [
        "additional-2",
        "core-1",
        "core-topic-other",
        "paused-1",
        "accepted-1",
        "accepted-same-topic-2",
        "additional-1",
        "other-syllabus",
        "additional-1",
        "missing"
      ];
    },
    async getPracticeById(practiceId) {
      return practices.get(practiceId) ?? null;
    },
    async checkPausedTopicValidity(input) {
      return {
        ...input,
        pausedDate: "2026-09-01",
        isPaused: true,
        unpaused: false
      };
    },
    async getCurrentDate() {
      return "2026-09-27";
    }
  });

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  });

  assert.deepEqual(
    result,
    ["additional-1", "core-topic-other"]
  );
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(acceptedTopicCalls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    date: "2026-09-27"
  }]);
});

test("web unpauses expired topics before building the additional pool", async () => {
  const validityCalls = [];
  const practices = new Map([
    ["practice-expired", practice("syllabus-1", "topic-expired")],
    ["practice-active", practice("syllabus-1", "topic-active")]
  ]);
  const useCase = new ListAdditionalMissionPracticeIds({
    dailyMissionRepository: {
      async getCoreMission() {
        return {topicId: "topic-core", practiceId: "core-1"};
      },
      async listPausedTopicIds() {
        return ["topic-expired", "topic-active"];
      },
      async isPracticeCompleted() {
        return true;
      },
      async listTopicStats() {
        return [];
      },
      async listAcceptedAdditionalTopicIds() {
        return [];
      }
    },
    async listAssignedPracticeIds() {
      return [...practices.keys()];
    },
    async getPracticeById(practiceId) {
      return practices.get(practiceId);
    },
    async checkPausedTopicValidity(input) {
      validityCalls.push(input);
      const isPaused = input.topicId === "topic-active";

      return {
        ...input,
        pausedDate: "2026-09-01",
        isPaused,
        unpaused: !isPaused
      };
    },
    async getCurrentDate() {
      return "2026-09-27";
    }
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), ["practice-expired"]);
  assert.deepEqual(validityCalls, [
    {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-expired"
    },
    {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-active"
    }
  ]);
});

test("web skips accepted-topic reads when no practices qualify", async () => {
  let acceptedReads = 0;
  const useCase = new ListAdditionalMissionPracticeIds({
    dailyMissionRepository: {
      async getCoreMission() {
        return {topicId: "topic-1", practiceId: "practice-1"};
      },
      async isPracticeCompleted() {
        return true;
      },
      async listPausedTopicIds() {
        return [];
      },
      async listTopicStats() {
        return [];
      },
      async listAcceptedAdditionalTopicIds() {
        acceptedReads += 1;
        return [];
      }
    },
    async listAssignedPracticeIds() {
      return ["practice-1"];
    },
    async getPracticeById() {
      return practice("syllabus-1", "topic-1");
    },
    async checkPausedTopicValidity(input) {
      return {
        ...input,
        pausedDate: "2026-09-01",
        isPaused: true,
        unpaused: false
      };
    },
    async getCurrentDate() {
      return "2026-09-27";
    }
  });

  const result = await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  });

  assert.deepEqual(result, []);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(acceptedReads, 0);
});

test("web uses core mission topic priority for additional missions", async () => {
  const practices = new Map([
    ["a-recent", practice("syllabus-1", "topic-recent")],
    ["m-oldest", practice("syllabus-1", "topic-oldest")],
    ["z-never", practice("syllabus-1", "topic-never")]
  ]);
  const useCase = new ListAdditionalMissionPracticeIds({
    dailyMissionRepository: {
      async getCoreMission() {
        return {topicId: "topic-core", practiceId: "core-1"};
      },
      async listPausedTopicIds() {
        return [];
      },
      async isPracticeCompleted() {
        return true;
      },
      async listTopicStats() {
        return [
          {topicId: "topic-recent", lastAcceptedDate: "2026-09-26"},
          {topicId: "topic-oldest", lastAcceptedDate: "2026-08-01"}
        ];
      },
      async listAcceptedAdditionalTopicIds() {
        return [];
      }
    },
    async listAssignedPracticeIds() {
      return [...practices.keys()];
    },
    async getPracticeById(practiceId) {
      return practices.get(practiceId);
    },
    async checkPausedTopicValidity() {
      throw new Error("must not be called");
    },
    async getCurrentDate() {
      return "2026-09-27";
    }
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), ["z-never", "m-oldest", "a-recent"]);
});
