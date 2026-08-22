const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ListAssignedPracticeIds,
} = require("./list_assigned_practice_ids");
const {
  ListCompletedPracticeIds,
} = require("./list_completed_practice_ids");

test("ListAssignedPracticeIds returns IDs for the requested student", async () => {
  const useCase = new ListAssignedPracticeIds({
    listAssignedIds: async (studentId) => {
      assert.equal(studentId, "student-1");
      return ["practice-1", "practice-2"];
    },
  });

  assert.deepEqual(
    await useCase.execute({ studentId: " student-1 " }),
    ["practice-1", "practice-2"],
  );
});

test("ListCompletedPracticeIds requires a student ID", async () => {
  const useCase = new ListCompletedPracticeIds({
    listCompletedIds: async () => [],
  });

  await assert.rejects(
    useCase.execute({}),
    /studentId is required/,
  );
});
