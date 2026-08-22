const assert = require("node:assert/strict");
const test = require("node:test");

const {
  practiceTypes,
} = require("../../../schema/practice_schema");
const {
  Question,
} = require("../domain/question");
const {
  DeleteQuestion,
} = require("./delete_question");
const {
  UpdateQuestion,
} = require("./update_question");
const {
  WriteQuestion,
} = require("./write_question");
const {
  WriteQuestions,
} = require("./write_questions");

function questionInput(overrides = {}) {
  return {
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    questionText: "What is 1 + 1?",
    options: {
      a: "1",
      b: "2",
      c: "3",
      d: "4",
    },
    correctAnswer: "b",
    group: practiceTypes.ASSESSMENT,
    explanation: "One plus one equals two.",
    hasDiagram: false,
    svg: "",
    difficulty: "Easy",
    language: "English",
    specialInstruction: "",
    ...overrides,
  };
}

function questionReference(overrides = {}) {
  return {
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram: false,
    questionId: "question-1",
    ...overrides,
  };
}

test("WriteQuestion returns the saved nested-schema question", async () => {
  const savedQuestion = { id: "question-1" };
  const useCase = new WriteQuestion({
    save: async (question) => {
      assert.equal(question.syllabusId, "syllabus-1");
      assert.equal(question.topicId, "topic-1");
      assert.equal(question.language, "English");
      assert.equal(question.hasDiagram, false);
      return savedQuestion;
    },
  });

  assert.equal(await useCase.execute(questionInput()), savedQuestion);
});

test("WriteQuestion requires an explicit diagram branch", async () => {
  const input = questionInput();
  delete input.hasDiagram;
  const useCase = new WriteQuestion({
    save: async () => {
      throw new Error("save should not be called");
    },
  });

  await assert.rejects(
    useCase.execute(input),
    /hasDiagram must be a boolean/,
  );
});

test("WriteQuestions supports questions in different nested branches", async () => {
  const savedQuestions = [{ id: "question-1" }, { id: "question-2" }];
  const useCase = new WriteQuestions({
    saveMany: async (questions) => {
      assert.deepEqual(
        questions.map((question) => ({
          language: question.language,
          hasDiagram: question.hasDiagram,
        })),
        [
          { language: "English", hasDiagram: false },
          { language: "Chinese", hasDiagram: true },
        ],
      );
      return savedQuestions;
    },
  });

  assert.equal(
    await useCase.execute([
      questionInput(),
      questionInput({
        language: "Chinese",
        hasDiagram: true,
        svg: "<svg></svg>",
      }),
    ]),
    savedQuestions,
  );
});

test("UpdateQuestion preserves the reference path", async () => {
  const existingQuestion = new Question({
    id: "question-1",
    ...questionInput(),
  });
  const savedQuestion = { id: "question-1", questionText: "Updated" };
  const useCase = new UpdateQuestion({
    getById: async (reference) => {
      assert.deepEqual(reference, questionReference());
      return existingQuestion;
    },
    save: async (question) => {
      assert.equal(question.questionText, "Updated");
      return savedQuestion;
    },
  });

  assert.equal(
    await useCase.execute(questionReference(), {
      questionText: "Updated",
    }),
    savedQuestion,
  );
});

test("UpdateQuestion rejects a changed question ID", async () => {
  const useCase = new UpdateQuestion({
    getById: async () => new Question({
      id: "question-1",
      ...questionInput(),
    }),
    save: async () => {
      throw new Error("save should not be called");
    },
  });

  await assert.rejects(
    useCase.execute(questionReference(), {
      questionId: "question-2",
    }),
    /questionId cannot be changed/,
  );
});

test("DeleteQuestion normalizes and returns the nested delete result", async () => {
  const deleted = {
    id: "question-1",
    path: "questions/syllabus-1/topics/topic-1/question-1",
  };
  const useCase = new DeleteQuestion({
    delete: async (reference) => {
      assert.deepEqual(reference, questionReference());
      return deleted;
    },
  });

  assert.equal(
    await useCase.execute({
      ...questionReference(),
      syllabusId: " syllabus-1 ",
    }),
    deleted,
  );
});
