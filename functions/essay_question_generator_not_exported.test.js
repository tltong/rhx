const assert = require("node:assert/strict");
const test = require("node:test");
test("essay generator feature APIs are available without new Firebase endpoints", () => {
  const feature = require("./features/essay_question_generator/essay_question_generator_module");
  const functions = require("./index");
  for (const name of ["getEssayQuestionGeneratorConfig", "saveEssayQuestionGeneratorConfig", "generateEssayQuestion",
    "saveEssayQuestion", "getEssayQuestionById", "listEssayQuestions", "getRandomEssayQuestion"]) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
});
