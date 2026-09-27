import assert from "node:assert/strict";
import test from "node:test";

import {
  PauseCoreDailyMission
} from "./application/pause_core_daily_mission.js";

test("web pause use case validates the paused topic result", async () => {
  const calls = [];
  const useCase = new PauseCoreDailyMission({
    async pauseCoreDailyMission(input) {
      calls.push(input);
      return {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        practiceId: "practice-1",
        pausedDate: "2026-09-27",
        isPaused: true,
        created: true
      };
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
  assert.deepEqual(calls, [{
    studentId: "student-1",
    practiceId: "practice-1"
  }]);
});

test("web pause use case requires a paused response", async () => {
  const useCase = new PauseCoreDailyMission({
    async pauseCoreDailyMission() {
      return {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        practiceId: "practice-1",
        pausedDate: "2026-09-27",
        isPaused: false,
        created: false
      };
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      practiceId: "practice-1"
    }),
    /was not paused/
  );
});
