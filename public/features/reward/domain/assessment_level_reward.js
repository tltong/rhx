async function createAssessmentLevelRewardId({syllabusId, topicId, assessmentFrameworkId, levelId}) {
  const key = JSON.stringify([syllabusId, topicId, assessmentFrameworkId, levelId]);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return "assessment-level-" + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

function requireMatchingLevelAward(existing, input) {
  for (const key of ["studentId", "categoryId", "awardId"]) {
    if (existing[key] !== input[key]) throw new Error("Saved level reward identity is inconsistent.");
  }
  for (const key of ["syllabusId", "topicId", "assessmentFrameworkId", "levelId"]) {
    if (existing.details[key] !== input.details[key]) throw new Error("Saved level reward scope is inconsistent.");
  }
}

export {createAssessmentLevelRewardId, requireMatchingLevelAward};
