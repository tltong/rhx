const assert = require("node:assert/strict");
const test = require("node:test");

const API_NAMES = [
  "getReliabilityConfig", "saveReliabilityConfig",
  "calculateTopicReliabilityScore", "calculateSubjectReliabilityScore",
  "saveTopicReliabilityScore", "getTopicReliabilityScore",
  "saveSubjectReliabilityScore", "getSubjectReliabilityScore",
];

test("reliability APIs are feature-module exports and are absent from the Firebase Functions entry point", () => {
  const feature = require("./features/reliability/reliability_module");
  const functions = require("./index");
  for (const name of API_NAMES) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
});
