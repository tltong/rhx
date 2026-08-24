import assert from "node:assert/strict";
import test from "node:test";

import {
  GetPracticeResultReview
} from "./get_practice_result_review.js";

function createResult() {
  return {
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
  };
}

test("GetPracticeResultReview composes answers and explanations", async () => {
  const useCase = new GetPracticeResultReview({
    practiceResultRepository: {
      getById: async () => createResult(),
    },
    getPracticeById: async () => ({
      id: "practice-1",
      type: "assessment",
      questions: [{questionId: "question-1"}],
    }),
    questionLoaders: {
      assessment: async () => [{
        questionText: "What is 1 + 1?",
        options: {a: "1", b: "2", c: "3", d: "4"},
        explanation: "Adding one and one gives two.",
        hasDiagram: false,
        svg: "",
      }],
    },
  });

  const review = await useCase.execute({
    practiceId: " practice-1 ",
    studentId: " student-1 ",
  });

  assert.equal(review.practiceType, "assessment");
  assert.equal(review.questions[0].questionId, "question-1");
  assert.equal(review.questions[0].selectedOption, "b");
  assert.equal(review.questions[0].correctAnswer, "b");
  assert.equal(
    review.questions[0].explanation,
    "Adding one and one gives two.",
  );
});

test("GetPracticeResultReview returns null before loading questions", async () => {
  let practiceRead = false;
  const useCase = new GetPracticeResultReview({
    practiceResultRepository: {getById: async () => null},
    getPracticeById: async () => {
      practiceRead = true;
    },
    questionLoaders: {},
  });

  assert.equal(await useCase.execute({
    practiceId: "practice-1",
    studentId: "student-1",
  }), null);
  assert.equal(practiceRead, false);
});
