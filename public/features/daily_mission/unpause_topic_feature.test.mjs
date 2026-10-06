import assert from "node:assert/strict";
import test from "node:test";

import {
  UnpauseTopic
} from "./application/unpause_topic.js";

test("web unpauses exactly the requested topic", async () => {
  const calls = [];
  const useCase = new UnpauseTopic({
    dailyMissionRepository: {
      async unpauseTopic(input) {
        calls.push(input);
      }
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
    isPaused: false
  });
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1"
  }]);
});

test("web unpause use case validates document IDs before deleting", async () => {
  let deleteCalls = 0;
  const useCase = new UnpauseTopic({
    dailyMissionRepository: {
      async unpauseTopic() {
        deleteCalls += 1;
      }
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      topicId: "invalid/topic"
    }),
    /must not contain a slash/
  );
  assert.equal(deleteCalls, 0);
});
