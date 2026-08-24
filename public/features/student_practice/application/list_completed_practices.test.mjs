import assert from "node:assert/strict";
import test from "node:test";

import {
  ListCompletedPractices
} from "./list_completed_practices.js";

test("ListCompletedPractices returns completions for a student", async () => {
  const completions = [{practiceId: "practice-1"}];
  const useCase = new ListCompletedPractices({
    listCompleted: async (studentId) => {
      assert.equal(studentId, "student-1");
      return completions;
    }
  });

  assert.equal(
    await useCase.execute({studentId: " student-1 "}),
    completions
  );
});

test("ListCompletedPractices requires a student ID", async () => {
  const useCase = new ListCompletedPractices({
    listCompleted: async () => []
  });

  await assert.rejects(useCase.execute({}), /studentId is required/);
});
