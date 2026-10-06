import assert from "node:assert/strict";
import test from "node:test";

import {
  IsTopicPaused
} from "./application/is_topic_paused.js";

test("web paused-topic status returns a boolean", async () => {
  const calls = [];
  const useCase = new IsTopicPaused({
    dailyMissionRepository: {
      async isTopicPaused(input) {
        calls.push(input);
        return true;
      }
    },
    async getCurrentDate() {
      return "2026-09-30";
    }
  });

  assert.equal(await useCase.execute({
    studentId: " student-1 ",
    syllabusId: " syllabus-1 ",
    topicId: " topic-1 "
  }), true);
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    currentDate: "2026-09-30"
  }]);
});

test("web paused-topic status rejects a non-boolean response", async () => {
  const useCase = new IsTopicPaused({
    dailyMissionRepository: {
      async isTopicPaused() {
        return {isPaused: false};
      }
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "topic-1"
    }),
    /status response is invalid/
  );
});
