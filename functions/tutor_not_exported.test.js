const assert = require("node:assert/strict");
const test = require("node:test");

test("tutor APIs are feature exports without Firebase callable endpoints", () => {
  const feature = require("./features/tutor/tutor_module");
  const functions = require("./index");
  for (const name of [
    "getTutorConfig", "saveTutorConfig",
    "generateTutorMiniQuestionSet", "getTutorMiniQuestionSet",
    "checkTutorMiniQuestionAnswer",
    "getTutorQuestionById",
  ]) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
  const preAssessment = require("./features/pre_assessment_question/pre_assessment_question_module");
  assert.equal(typeof preAssessment.getPreAssessmentQuestionById, "function");
  assert.equal(Object.hasOwn(functions, "getPreAssessmentQuestionById"), false);
});

