import assert from "node:assert/strict";
import test from "node:test";

import {
  ListAdditionalMissionPracticeIds
} from "./application/list_additional_mission_practice_ids.js";

test("web additional mission use case validates and sorts practice IDs", async () => {
  const calls = [];
  const useCase = new ListAdditionalMissionPracticeIds({
    async listAdditionalMissionPracticeIds(input) {
      calls.push(input);
      return ["practice-2", "practice-1", "practice-2"];
    }
  });

  const result = await useCase.execute({
    studentId: " student-1 ",
    syllabusId: " syllabus-1 "
  });

  assert.deepEqual(result, ["practice-1", "practice-2"]);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }]);
});

test("web additional mission use case rejects a non-list response", async () => {
  const useCase = new ListAdditionalMissionPracticeIds({
    async listAdditionalMissionPracticeIds() {
      return null;
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      syllabusId: "syllabus-1"
    }),
    /response is invalid/
  );
});
