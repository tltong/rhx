import assert from "node:assert/strict";
import test from "node:test";

import {
  CheckPausedTopicValidity
} from "./application/check_paused_topic_validity.js";

test("web paused-topic check validates the status response", async () => {
  const calls = [];
  const useCase = new CheckPausedTopicValidity({
    async checkPausedTopicValidity(input) {
      calls.push(input);
      return {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        pausedDate: "2026-09-01",
        isPaused: false,
        unpaused: true
      };
    }
  });

  assert.deepEqual(await useCase.execute({
    studentId: " student-1 ",
    syllabusId: " syllabus-1 ",
    topicId: " topic-1 "
  }), {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    pausedDate: "2026-09-01",
    isPaused: false,
    unpaused: true
  });
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  }]);
});

test("web paused-topic check accepts a missing pause record", async () => {
  const useCase = new CheckPausedTopicValidity({
    async checkPausedTopicValidity() {
      return {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        pausedDate: null,
        isPaused: false,
        unpaused: false
      };
    }
  });

  assert.deepEqual(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  }), {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    pausedDate: null,
    isPaused: false,
    unpaused: false
  });
});
