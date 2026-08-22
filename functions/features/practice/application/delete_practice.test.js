const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DeletePractice,
} = require("./delete_practice");

test("DeletePractice delegates deletion to the practice repository", async () => {
  const deletedIds = [];
  const useCase = new DeletePractice({
    delete: async (practiceId) => {
      deletedIds.push(practiceId);
      return {
        id: practiceId,
        path: `practices/${practiceId}`,
      };
    },
  });

  const result = await useCase.execute("practice-1");

  assert.deepEqual(deletedIds, ["practice-1"]);
  assert.deepEqual(result, {
    id: "practice-1",
    path: "practices/practice-1",
  });
});
