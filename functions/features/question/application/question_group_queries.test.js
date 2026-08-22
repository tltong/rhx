const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GetQuestionCount,
} = require("./get_question_count");
const {
  ListQuestionIds,
} = require("./list_question_ids");

const questionGroup = Object.freeze({
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  language: "English",
  hasDiagram: false,
});

test("GetQuestionCount returns the repository count", async () => {
  const useCase = new GetQuestionCount({
    countByGroup: async (group) => {
      assert.deepEqual(group, questionGroup);
      return 11;
    },
  });

  assert.equal(await useCase.execute(questionGroup), 11);
});

test("ListQuestionIds returns every repository question ID", async () => {
  const useCase = new ListQuestionIds({
    listIdsByGroup: async (group) => {
      assert.deepEqual(group, questionGroup);
      return ["question-001", "question-002", "question-003"];
    },
  });

  assert.deepEqual(
    await useCase.execute(questionGroup),
    ["question-001", "question-002", "question-003"],
  );
});

test("ListQuestionIds rejects an invalid repository result", async () => {
  const useCase = new ListQuestionIds({
    listIdsByGroup: async () => ["question-001", ""],
  });

  await assert.rejects(
    useCase.execute(questionGroup),
    /invalid ID at index 1/,
  );
});
