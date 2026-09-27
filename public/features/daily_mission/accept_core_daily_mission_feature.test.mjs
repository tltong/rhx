import assert from "node:assert/strict";
import test from "node:test";

import {
  AcceptCoreDailyMission
} from "./application/accept_core_daily_mission.js";

test("web acceptance use case validates the accepted mission", async () => {
  const calls = [];
  const useCase = new AcceptCoreDailyMission({
    async acceptCoreDailyMission(input) {
      calls.push(input);
      return {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: true,
        created: true
      };
    }
  });
  const result = await useCase.execute({
    studentId: " student-1 ",
    practiceId: " practice-1 "
  });

  assert.deepEqual(calls, [{
    studentId: "student-1",
    practiceId: "practice-1"
  }]);
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
});

test("web acceptance use case rejects an unaccepted response", async () => {
  const useCase = new AcceptCoreDailyMission({
    async acceptCoreDailyMission() {
      return {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: false,
        created: false
      };
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      practiceId: "practice-1"
    }),
    /was not accepted/
  );
});
