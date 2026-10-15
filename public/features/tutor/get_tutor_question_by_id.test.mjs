import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {GetTutorQuestionById as WebGet} from "./application/get_tutor_question_by_id.js";
const require = createRequire(import.meta.url);
const {GetTutorQuestionById: BackendGet} = require(
  "../../../functions/features/tutor/application/get_tutor_question_by_id.js"
);

for (const [layer, Get] of [["backend", BackendGet], ["web", WebGet]]) {
  test(layer + ": resolves either question feature, retaining complete source data", async () => {
    const original = {id: "q", correctAnswer: "b", explanation: "Because...", svg: "<svg><text>A</text></svg>"};
    for (const [question, preAssessmentQuestion] of [[original, null], [null, original], [null, null]]) {
      const calls = [];
      const useCase = new Get({
        getQuestionById: async id => {calls.push(["question", id]); return question;},
        getPreAssessmentQuestionById: async id => {calls.push(["pre-assessment", id]); return preAssessmentQuestion;},
      });
      assert.equal(await useCase.execute("q"), question || preAssessmentQuestion);
      assert.deepEqual(calls, [["question", "q"], ["pre-assessment", "q"]]);
    }
  });

  test(layer + ": rejects IDs shared by both collections rather than returning the wrong question", async () => {
    const useCase = new Get({
      getQuestionById: async () => ({id: "q"}),
      getPreAssessmentQuestionById: async () => ({id: "q"}),
    });
    await assert.rejects(() => useCase.execute("q"), error => {
      assert.equal(error.code, "ambiguous-question-id");
      assert.match(error.message, /both question collections/);
      return true;
    });
  });

  test(layer + ": failed source reads propagate without treating them as missing questions", async () => {
    const failure = new Error("Read unavailable");
    for (const failedSource of ["question", "pre-assessment"]) {
      const useCase = new Get({
        getQuestionById: async () => {if (failedSource === "question") throw failure; return null;},
        getPreAssessmentQuestionById: async () => {if (failedSource === "pre-assessment") throw failure; return null;},
      });
      await assert.rejects(() => useCase.execute("q"), failure);
    }
  });
}
