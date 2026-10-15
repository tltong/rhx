import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {GetTutorMiniQuestionSet as WebGet} from "./application/get_tutor_mini_question_set.js";

const require = createRequire(import.meta.url);
const {GetTutorMiniQuestionSet: BackendGet} = require(
  "../../../functions/features/tutor/application/get_tutor_mini_question_set.js"
);
const reference = {questionId: "q", language: "English"};

for (const [layer, GetSet] of [["backend", BackendGet], ["web", WebGet]]) {
  test(layer + ": returns a saved set without calling generation", async () => {
    const saved = {miniQuestions: [{expectedAnswer: "60°", answerExplanation: "A triangle has 180°."}]};
    const useCase = new GetSet({
      get: async input => {assert.deepEqual(input, reference); return saved;},
    }, () => {throw new Error("Do not regenerate a saved set");});
    assert.equal(await useCase.execute({questionId: " q ", language: " English "}), saved);
  });

  test(layer + ": generates and returns a missing set after the backend lookup", async () => {
    const order = [];
    const generated = {miniQuestions: [{expectedAnswer: "60°", answerExplanation: "The missing angle is 60°."}]};
    const assertAccess = () => {order.push("access");};
    const useCase = new GetSet({
      get: async input => {assert.deepEqual(input, reference); order.push("get"); return null;},
    }, async (input, options) => {
      assert.deepEqual(input, reference);
      assert.equal(options.assertAccess, assertAccess);
      order.push("generate");
      return generated;
    });
    assert.equal(await useCase.execute(reference, {assertAccess}), generated);
    assert.deepEqual(order, ["get", "access", "generate"]);
  });

  test(layer + ": a failed lookup propagates without calling generation", async () => {
    const failure = new Error("Backend unavailable");
    let generates = 0;
    const useCase = new GetSet({get: async () => {throw failure;}}, async () => {generates++;});
    await assert.rejects(() => useCase.execute(reference), failure);
    assert.equal(generates, 0);
  });

  test(layer + ": generation failures propagate instead of returning null or retrying", async () => {
    const failure = new Error("LLM unavailable");
    let generates = 0;
    const useCase = new GetSet({get: async () => null}, async () => {generates++; throw failure;});
    await assert.rejects(() => useCase.execute(reference), failure);
    assert.equal(generates, 1);
  });

  test(layer + ": caller input changes during lookup cannot redirect generation", async () => {
    const input = {...reference};
    const useCase = new GetSet({get: async () => {
      input.questionId = "changed";
      input.language = "Malay";
      return null;
    }}, async selected => selected);
    assert.deepEqual(await useCase.execute(input), reference);
  });

  test(layer + ": access changes during lookup block cached results and generation", async () => {
    for (const saved of [null, {miniQuestions: []}]) {
      let generates = 0;
      const failure = new Error("Account changed");
      const useCase = new GetSet({get: async () => saved}, async () => {generates++;});
      await assert.rejects(() => useCase.execute(reference, {assertAccess: () => {throw failure;}}), failure);
      assert.equal(generates, 0);
    }
  });
}
