const assert = require("node:assert/strict");
const test = require("node:test");

test("question seed generator APIs are feature exports without Firebase endpoints", () => {
  const feature = require("./features/question_seed_generator/question_seed_generator_module");
  const functions = require("./index");
  for (const name of [
    "getQuestionSeedGeneratorConfig", "saveQuestionSeedGeneratorConfig",
    "getQuestionSeedEntries", "saveQuestionSeedEntries", "saveQuestionSeedEntry", "generateQuestionSeedEntry",
    "removeQuestionSeedEntries",
    "getRandomQuestionSeedEntry", "getCombinedQuestionSeed",
  ]) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
});
