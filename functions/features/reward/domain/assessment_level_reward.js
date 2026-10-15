const {createHash} = require("node:crypto");

async function createAssessmentLevelRewardId({syllabusId, topicId, assessmentFrameworkId, levelId}) {
  const key = JSON.stringify([syllabusId, topicId, assessmentFrameworkId, levelId]);
  return "assessment-level-" + createHash("sha256").update(key, "utf8").digest("hex");
}

function requireMatchingLevelAward(existing, input) {
  for (const key of ["studentId", "categoryId", "awardId"]) {
    if (existing[key] !== input[key]) throw new Error("Saved level reward identity is inconsistent.");
  }
  for (const key of ["syllabusId", "topicId", "assessmentFrameworkId", "levelId"]) {
    if (existing.details[key] !== input.details[key]) throw new Error("Saved level reward scope is inconsistent.");
  }
}

module.exports = {createAssessmentLevelRewardId, requireMatchingLevelAward};
