const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GetPracticeResultReview,
} = require("./get_practice_result_review");

test("GetPracticeResultReview composes answers and explanations", async () => {
  const useCase = new GetPracticeResultReview({
    practiceResultRepository: {
      getById: async () => ({
        practiceId: "practice-1",
        studentId: "student-1",
        submittedAt: new Date("2026-08-24T08:00:00.000Z"),
        timeTakenSeconds: 90,
        questionsCorrect: 1,
        totalQuestions: 1,
        score: 100,
        answers: {
          "question-1": {
            selectedOption: "b",
            correctAnswer: "b",
            isCorrect: true,
          },
        },
      }),
    },
    getPracticeById: async () => ({
      id: "practice-1",
      type: "pre assessment",
      questions: [{questionId: "question-1"}],
    }),
    questionLoaders: {
      "pre assessment": async () => [{
        questionText: "What is 1 + 1?",
        options: {a: "1", b: "2", c: "3", d: "4"},
        explanation: "Adding one and one gives two.",
        hasDiagram: false,
        svg: "",
      }],
    },
  });

  const review = await useCase.execute({
    practiceId: "practice-1",
    studentId: "student-1",
  });

  assert.equal(review.practiceType, "pre assessment");
  assert.equal(review.questions[0].isCorrect, true);
  assert.equal(
    review.questions[0].explanation,
    "Adding one and one gives two.",
  );
});
