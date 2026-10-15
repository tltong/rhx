const assert = require("node:assert/strict");
const test = require("node:test");

test("reward APIs are feature-module exports and are absent from the Firebase Functions entry point", () => {
  const feature = require("./features/reward/reward_module");
  const functions = require("./index");
  for (const name of [
    "getRewardConfig", "saveRewardConfig",
    "getAssessmentFrameworkRewardConfig", "saveAssessmentFrameworkRewardConfig",
    "saveStudentReward", "getStudentRewardTotal",
    "awardAssessmentLevelUp", "awardAdditionalMissionCompletion", "awardDailyMissionCompletion", "awardStudentLogin",
    "getStudentRewardCategoryTotal", "listStudentRewardHistory", "listRecentStudentRewardActivities",
  ]) {
    assert.equal(typeof feature[name], "function");
    assert.equal(Object.hasOwn(functions, name), false);
  }
});
