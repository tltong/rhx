import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {GetPracticeResultReview as WebGet} from "./get_practice_result_review.js";
const {GetPracticeResultReview: BackendGet} = createRequire(import.meta.url)("../../../../functions/features/practice_result/application/get_practice_result_review.js");

function harness(Get, type, policy) {
  const references = ["off", "on", "off"].map((topicId, index) => ({questionId: "q" + index, syllabusId: "math", topicId}));
  const questions = references.map(reference => ({...reference, questionText: "What is 1 + 1?", options: {a: "1", b: "2", c: "3", d: "4"}, explanation: "Add one and one.", hasDiagram: false}));
  const calls = [];
  const useCase = new Get({
    practiceResultRepository: {getById: async () => ({practiceId: "p", studentId: "student", submittedAt: new Date(), timeTakenSeconds: 20,
      questionsCorrect: 0, totalQuestions: 3, score: 0,
      answers: Object.fromEntries(references.map(({questionId}) => [questionId, {selectedOption: "a", correctAnswer: "b", isCorrect: false}]))})},
    getPracticeById: async () => ({type, questions: references}),
    questionLoaders: {[type]: async () => questions},
    isTopicTutorEnabled: async (...args) => {calls.push(args); return policy(...args);},
  });
  return {useCase, calls};
}

for (const [layer, Get] of [["backend", BackendGet], ["web", WebGet]]) {
  for (const type of ["assessment", "pre assessment"]) {
    test(layer + ": " + type + " reviews use each source topic's current policy once", async () => {
      let enabled = false;
      const h = harness(Get, type, (_, topicId) => topicId === "on" || enabled);
      const input = {practiceId: "p", studentId: "student", tutorEnabled: true, topicId: "forged"};
      const first = await h.useCase.execute(input);
      assert.deepEqual(first.questions.map(q => q.tutorEnabled), [false, true, false]);
      assert.deepEqual(h.calls, [["math", "off"], ["math", "on"]]);
      assert.equal(first.score, 0);
      enabled = true;
      assert.deepEqual((await h.useCase.execute(input)).questions.map(q => q.tutorEnabled), [true, true, true]);
      assert.equal(h.calls.length, 4, "Refresh reads the current setting instead of retaining an old decision");
    });
  }

  test(layer + ": policy failures preserve scores and explanations while hiding tutor", async () => {
    const {useCase} = harness(Get, "assessment", () => {throw new Error("Policy unavailable");});
    const review = await useCase.execute({practiceId: "p", studentId: "student"});
    assert.equal(review.totalQuestions, 3);
    assert.ok(review.questions.every(q => !q.tutorEnabled && q.explanation === "Add one and one."));
  });
}
