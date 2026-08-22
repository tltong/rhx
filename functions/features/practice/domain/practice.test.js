const assert = require("node:assert/strict");
const test = require("node:test");

const {
  practiceTypes,
} = require("../../../schema/practice_schema");
const {
  Practice,
} = require("./practice");

test("pre-assessment practices retain the original question reference", () => {
  const practice = new Practice({
    type: practiceTypes.PRE_ASSESSMENT,
    questions: [{
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      questionId: "question-1",
    }],
  });

  assert.deepEqual(
    { ...practice.questions[0] },
    {
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      questionId: "question-1",
    },
  );
});

test("assessment practices require language and diagram routing fields", () => {
  assert.throws(
    () => new Practice({
      type: practiceTypes.ASSESSMENT,
      questions: [{
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        questionId: "question-1",
      }],
    }),
    /language is required/,
  );
});

test("assessment practices retain expanded question references", () => {
  const practice = new Practice({
    type: practiceTypes.ASSESSMENT,
    questions: [{
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      language: "English",
      hasDiagram: false,
      questionId: "question-1",
    }],
  });

  assert.deepEqual(
    { ...practice.questions[0] },
    {
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      language: "English",
      hasDiagram: false,
      questionId: "question-1",
    },
  );
});
