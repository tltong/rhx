import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {CheckTutorMiniQuestionAnswer as WebCheck} from "./application/check_tutor_mini_question_answer.js";

const require = createRequire(import.meta.url);
const {CheckTutorMiniQuestionAnswer: BackendCheck} = require(
  "../../../functions/features/tutor/application/check_tutor_mini_question_answer.js"
);
const request = {questionId: "q", language: "English", miniQuestionCount: 3, sequence: 1, answer: "180°"};
const miniQuestion = {
  sequence: 1, questionText: "What is the sum of a triangle's angles?",
  expectedAnswer: "180°", acceptedAnswers: ["180 degrees", "180"],
  answerExplanation: "A triangle's angles add up to 180 degrees.",
};

for (const [layer, Check] of [["backend", BackendCheck], ["web", WebCheck]]) {
  test(layer + ": expected and accepted answers pass without an LLM call", async () => {
    const useCase = new Check({
      repository: {get: async ref => {
        assert.equal(ref.questionId, "q");
        assert.equal(ref.miniQuestionCount, 3);
        return {miniQuestions: [miniQuestion]};
      }},
      generateLlmText: () => {throw new Error("Do not call the LLM for a listed answer");},
    });
    for (const answer of ["180°", " 180 degrees ", "180\n degrees", "１８０"]) {
      assert.deepEqual(await useCase.execute({...request, answer}), {isCorrect: true});
    }
  });

  test(layer + ": other wording uses the LLM with the mini question and reference answers only", async () => {
    let calls = 0;
    const useCase = new Check({
      repository: {get: async () => ({miniQuestions: [miniQuestion]})},
      generateLlmText: async (prompt, options) => {
        calls++;
        const data = JSON.parse(prompt.split("Reference data:\n")[1]);
        assert.equal(data.answer, "One hundred and eighty degrees.");
        assert.equal(data.expectedAnswer, miniQuestion.expectedAnswer);
        assert.equal(data.questionText, miniQuestion.questionText);
        assert.deepEqual(data.acceptedAnswers, miniQuestion.acceptedAnswers);
        assert.equal(Object.hasOwn(data, "studentId"), false);
        assert.equal(options.temperature, 0);
        return {isCorrect: true, answer: "discard"};
      },
    });
    assert.deepEqual(await useCase.execute({...request, answer: "One hundred and eighty degrees.", studentId: "discard"}), {isCorrect: true});
    assert.equal(calls, 1);
  });

  test(layer + ": preserves signs and case-sensitive units for semantic checking", async () => {
    let calls = 0;
    const useCase = new Check({
      repository: {get: async () => ({miniQuestions: [{...miniQuestion, expectedAnswer: "60 m", acceptedAnswers: []}]})},
      generateLlmText: async () => {calls++; return {isCorrect: false};},
    });
    for (const answer of ["-60 m", "60 M", "60 m but also 90 m"]) {
      assert.deepEqual(await useCase.execute({...request, answer}), {isCorrect: false});
    }
    assert.equal(calls, 3);
  });

  test(layer + ": malformed model verdicts and provider failures propagate", async () => {
    let result;
    const useCase = new Check({
      repository: {get: async () => ({miniQuestions: [miniQuestion]})},
      generateLlmText: async () => {if (result instanceof Error) throw result; return result;},
    });
    for (result of [null, [], {}, {isCorrect: "false"}, "not JSON", new Error("LLM unavailable")]) {
      await assert.rejects(() => useCase.execute({...request, answer: "another answer"}));
    }
    result = '{"isCorrect":false}';
    assert.deepEqual(await useCase.execute({...request, answer: "another answer"}), {isCorrect: false});
  });

  test(layer + ": invalid input is rejected before reads and missing sets never generate", async () => {
    let reads = 0;
    const useCase = new Check({
      repository: {get: async () => {reads++; return null;}},
      generateLlmText: () => {throw new Error("Do not call the LLM without a saved mini question");},
    });
    for (const input of [null, [], {}, {...request, answer: ""}, {...request, answer: 42},
      {...request, sequence: 0}, {...request, sequence: 1.5}, {...request, questionId: "a/b"},
      ...[undefined, null, 0, "3"].map(miniQuestionCount => ({...request, miniQuestionCount}))]) {
      await assert.rejects(() => useCase.execute(input));
    }
    assert.equal(reads, 0);
    await assert.rejects(() => useCase.execute(request), /Load the tutor mini question set/);
    assert.equal(reads, 1);
  });

  test(layer + ": rejects unknown steps and retains access checks across the LLM call", async () => {
    let userChanged = false;
    let calls = 0;
    const useCase = new Check({
      repository: {get: async () => ({miniQuestions: [miniQuestion]})},
      generateLlmText: async () => {calls++; userChanged = true; return {isCorrect: true};},
    });
    await assert.rejects(() => useCase.execute({...request, sequence: 2}), /not found/);
    await assert.rejects(() => useCase.execute({...request, answer: "One hundred eighty degrees"}, {
      assertAccess: () => {if (userChanged) throw new Error("Account changed");},
    }), /Account changed/);
    assert.equal(calls, 1);
  });
}
