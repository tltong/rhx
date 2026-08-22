const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AssessStudentPractice,
} = require("./assess_student_practice");

function createPractice(type) {
  return {
    id: "practice-1",
    type,
    questions: [{
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      questionId: "question-1",
    }],
  };
}

function createUseCase(type, calls) {
  return new AssessStudentPractice({
    async getPracticeResult() {
      return {
        practiceId: "practice-1",
        studentId: "student-1",
        score: 80,
      };
    },
    async getPracticeById() {
      return createPractice(type);
    },
    async assessPreAssessmentPractice(input) {
      calls.push(["pre", input]);
      return {branch: "pre"};
    },
    async assessNormalAssessmentPractice(input) {
      calls.push(["normal", input]);
      return {branch: "normal"};
    },
    preAssessmentPracticeType: "pre assessment",
    assessmentPracticeType: "assessment",
  });
}

test("routes pre-assessment practices to the pre-assessment branch", async () => {
  const calls = [];
  const result = await createUseCase("pre assessment", calls).execute({
    studentId: "student-1",
    practiceId: "practice-1",
  });

  assert.equal(result.branch, "pre");
  assert.equal(calls[0][0], "pre");
});

test("routes normal practices to the normal-assessment branch", async () => {
  const calls = [];
  const result = await createUseCase("assessment", calls).execute({
    studentId: "student-1",
    practiceId: "practice-1",
  });

  assert.equal(result.branch, "normal");
  assert.equal(calls[0][0], "normal");
});
