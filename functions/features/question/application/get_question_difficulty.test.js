const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GetQuestionDifficulty,
} = require("./get_question_difficulty");

test("returns the difficulty of the referenced question", async () => {
  const reference = {
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram: false,
    questionId: "question-1",
  };
  const useCase = new GetQuestionDifficulty({
    async getById(input) {
      assert.deepEqual(input, reference);
      return {difficulty: "Medium"};
    },
  });

  assert.equal(await useCase.execute(reference), "Medium");
});

test("throws when the question does not exist", async () => {
  const useCase = new GetQuestionDifficulty({
    async getById() {
      return null;
    },
  });

  await assert.rejects(
    useCase.execute({questionId: "missing-question"}),
    /Question missing-question was not found/,
  );
});
