import assert from "node:assert/strict";
import test from "node:test";

import {
  AcceptAdditionalDailyMission
} from "./application/accept_additional_daily_mission.js";

test("web additional acceptance validates the accepted mission", async () => {
  const calls = [];
  const useCase = new AcceptAdditionalDailyMission({
    async acceptAdditionalDailyMission(input) {
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
  assert.deepEqual(calls, [{
    studentId: "student-1",
    practiceId: "practice-1"
  }]);
});

test("web additional acceptance requires an accepted response", async () => {
  const useCase = new AcceptAdditionalDailyMission({
    async acceptAdditionalDailyMission() {
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
