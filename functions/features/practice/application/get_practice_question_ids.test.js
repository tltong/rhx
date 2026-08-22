const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GetPracticeQuestionIds,
} = require("./get_practice_question_ids");

test("returns question IDs in their stored practice order", async () => {
  const useCase = new GetPracticeQuestionIds({
    getById: async (practiceId) => {
      assert.equal(practiceId, "practice-1");

      return {
        questions: [
          { questionId: "question-3" },
          { questionId: "question-1" },
          { questionId: "question-2" },
        ],
      };
    },
  });

  assert.deepEqual(
    await useCase.execute(" practice-1 "),
    ["question-3", "question-1", "question-2"],
  );
});

test("throws when the practice does not exist", async () => {
  const useCase = new GetPracticeQuestionIds({
    getById: async () => null,
  });

  await assert.rejects(
    useCase.execute("missing-practice"),
    /Practice missing-practice was not found/,
  );
});
