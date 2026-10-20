const assert = require("node:assert/strict");
const test = require("node:test");

test("essay scoring feature APIs are available without new Firebase endpoints", () => {
  const feature = require("./features/essay_scoring/essay_scoring_module");
  const functions = require("./index");
  for (const name of ["scoreEssay", "saveEssayResult", "getEssayResult", "getEssayScoringConfig", "saveEssayScoringConfig"]) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
});

