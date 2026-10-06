import assert from "node:assert/strict";
import test from "node:test";

import {
  PauseCoreDailyMission
} from "./application/pause_core_daily_mission.js";

function practice() {
  return {
    id: "practice-1",
    questions: [{
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      questionId: "question-1"
    }]
  };
}

test("web pauses the practice topic without selecting another mission", async () => {
  const calls = [];
  const useCase = new PauseCoreDailyMission({
    isTopicPausable: async () => true,
    dailyMissionRepository: {
      async pauseTopic(input) {
        calls.push(["pause", input]);
        return {
          pausedDate: "2026-09-27",
          created: true
        };
      }
    },
    async getPracticeById(practiceId) {
      calls.push(["practice", practiceId]);
      return practice();
    },
    async getCurrentDate() {
      calls.push(["date"]);
      return "2026-09-27";
    }
  });

  assert.deepEqual(await useCase.execute({
    studentId: " student-1 ",
    practiceId: " practice-1 "
  }), {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    pausedDate: "2026-09-27",
    isPaused: true,
    created: true
  });
  assert.deepEqual(calls, [
    ["practice", "practice-1"],
    ["date"],
    ["pause", {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      pausedDate: "2026-09-27"
    }]
  ]);
});

test("web returns the original date when the topic was already paused", async () => {
  const useCase = new PauseCoreDailyMission({
    isTopicPausable: async () => true,
    dailyMissionRepository: {
      async pauseTopic() {
        return {
          pausedDate: "2026-09-20",
          created: false
        };
      }
    },
    async getPracticeById() {
      return practice();
    },
    async getCurrentDate() {
      return "2026-09-27";
    }
  });

  const result = await useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1"
  });

  assert.equal(result.pausedDate, "2026-09-20");
  assert.equal(result.created, false);
});

test("web rejects an unknown practice without pausing a topic", async () => {
  let pauseCalls = 0;
  const useCase = new PauseCoreDailyMission({
    isTopicPausable: async () => true,
    dailyMissionRepository: {
      async pauseTopic() {
        pauseCalls += 1;
      }
    },
    async getPracticeById() {
      return null;
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      practiceId: "practice-1"
    }),
    (error) => error.code === "not-found"
  );
  assert.equal(pauseCalls, 0);
});

test("web rejects non-pausable practice topics before writing a pause", async () => {
  let pauseCalls = 0;
  const checks = [];
  const useCase = new PauseCoreDailyMission({
    dailyMissionRepository: {
      async pauseTopic() {
        pauseCalls += 1;
        return {pausedDate: "2026-10-04", created: true};
      }
    },
    async getPracticeById() {
      return practice();
    },
    async isTopicPausable(syllabusId, topicId) {
      checks.push({syllabusId, topicId});
      return false;
    },
    async getCurrentDate() {
      throw new Error("No pause date should be needed for a forbidden pause.");
    }
  });

  await assert.rejects(() => useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1"
  }), {
    code: "failed-precondition",
    message: "This topic cannot be paused."
  });
  assert.deepEqual(checks, [{syllabusId: "syllabus-1", topicId: "topic-1"}]);
  assert.equal(pauseCalls, 0);
});

test("web does not pause when the syllabus eligibility check fails", async () => {
  let pauseCalls = 0;
  const useCase = new PauseCoreDailyMission({
    dailyMissionRepository: {
      async pauseTopic() {
        pauseCalls += 1;
      }
    },
    async getPracticeById() {
      return practice();
    },
    async isTopicPausable() {
      throw new Error("Syllabus topic could not be found.");
    }
  });

  await assert.rejects(() => useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1"
  }), /Syllabus topic could not be found/);
  assert.equal(pauseCalls, 0);
});
