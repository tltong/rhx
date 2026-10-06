import assert from "node:assert/strict";
import test from "node:test";

import {
  AcceptCoreDailyMission
} from "./application/accept_core_daily_mission.js";

function practice(syllabusId = "syllabus-1", topicId = "topic-1") {
  return {
    id: "practice-1",
    questions: [{syllabusId, topicId, questionId: "question-1"}]
  };
}

function createUseCase({
  acceptance = {created: true},
  mission = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: false
  },
  selectedPractice = practice()
} = {}) {
  const calls = [];
  const useCase = new AcceptCoreDailyMission({
    dailyMissionRepository: {
      async acceptCoreMission(input) {
        calls.push(["accept", input]);
        return acceptance;
      }
    },
    async getNextCoreDailyMission(input) {
      calls.push(["mission", input]);
      return mission;
    },
    async getPracticeById(practiceId) {
      calls.push(["practice", practiceId]);
      return selectedPractice;
    }
  });

  return {calls, useCase};
}

test("web acceptance validates and stores the current core mission", async () => {
  const {calls, useCase} = createUseCase();
  const result = await useCase.execute({
    studentId: " student-1 ",
    practiceId: " practice-1 "
  });

  assert.deepEqual(result, {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: true,
    created: true
  });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [
    ["practice", "practice-1"],
    ["mission", {
      studentId: "student-1",
      syllabusId: "syllabus-1"
    }],
    ["accept", {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      practiceId: "practice-1",
      date: "2026-09-27"
    }]
  ]);
});

test("web acceptance preserves an idempotent repository result", async () => {
  const {useCase} = createUseCase({
    acceptance: {created: false}
  });
  const result = await useCase.execute({
    studentId: "student-1",
    practiceId: "practice-1"
  });

  assert.equal(result.created, false);
  assert.equal(result.isAccepted, true);
});

test("web acceptance rejects a practice that is not the current suggestion", async () => {
  const {calls, useCase} = createUseCase({
    mission: {
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      practiceId: "practice-2",
      date: "2026-09-27",
      isAccepted: false
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      practiceId: "practice-1"
    }),
    (error) => (
      error.code === "failed-precondition"
      && /not the student's current core daily mission/.test(error.message)
    )
  );
  assert.equal(calls.some(([operation]) => operation === "accept"), false);
});
