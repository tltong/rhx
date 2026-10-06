import assert from "node:assert/strict";
import test from "node:test";

import {
  AcceptAdditionalDailyMission
} from "./application/accept_additional_daily_mission.js";

function practice() {
  return {
    questions: [{
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      questionId: "question-1"
    }]
  };
}

test("web accepts an additional mission without selection checks", async () => {
  const calls = [];
  const useCase = new AcceptAdditionalDailyMission({
    dailyMissionRepository: {
      async acceptAdditionalMission(input) {
        calls.push(["accept", input]);
        return {created: true};
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
    date: "2026-09-27",
    isAccepted: true,
    created: true
  });
  assert.deepEqual(calls, [
    ["practice", "practice-1"],
    ["date"],
    ["accept", {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      practiceId: "practice-1",
      date: "2026-09-27"
    }]
  ]);
});

test("web preserves an idempotent additional acceptance result", async () => {
  const useCase = new AcceptAdditionalDailyMission({
    dailyMissionRepository: {
      async acceptAdditionalMission() {
        return {created: false};
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

  assert.equal(result.created, false);
  assert.equal(result.isAccepted, true);
});

test("web rejects an unknown practice without writing a mission", async () => {
  let acceptanceCalls = 0;
  const useCase = new AcceptAdditionalDailyMission({
    dailyMissionRepository: {
      async acceptAdditionalMission() {
        acceptanceCalls += 1;
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
  assert.equal(acceptanceCalls, 0);
});
