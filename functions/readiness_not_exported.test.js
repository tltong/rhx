const assert = require("node:assert/strict");
const test = require("node:test");

const API_NAMES = [
  "getReadinessConfig", "saveReadinessConfig", "getDifficultyWeight",
  "getReadinessPracticeCount", "setReadinessPracticeCount",
  "getPreAssessmentWeight", "setPreAssessmentWeight",
  "calculateReadinessScore", "calculateSubjectReadinessScore", "saveReadinessScore",
  "getReadinessScore", "getReadinessScoreHistory",
  "saveSubjectReadinessScore", "getSubjectReadinessScore", "getSubjectReadinessScoreHistory",
];

test("readiness APIs are feature-module exports and are absent from the Firebase Functions entry point", () => {
  const feature = require("./features/readiness/readiness_module");
  const functions = require("./index");
  for (const name of API_NAMES) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
});
