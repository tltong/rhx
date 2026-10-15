function requireId(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")
      || [".", ".."].includes(value.trim()) || /^__.*__$/.test(value.trim())
      || new TextEncoder().encode(value.trim()).length > 1500) {
    throw new Error(name + " must be a valid document ID.");
  }
  return value.trim();
}

function requirePracticeAssessmentScope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Assessment scope is required.");
  return {studentId: requireId(input.studentId, "studentId"), practiceId: requireId(input.practiceId, "practiceId")};
}

class PracticeAssessment {
  constructor(input) {
    Object.assign(this, requirePracticeAssessmentScope(input));
    for (const key of ["syllabusId", "topicId", "assessmentFrameworkId", "levelId"]) this[key] = requireId(input[key], key);
    this.previousLevelId = input.previousLevelId === null ? null : requireId(input.previousLevelId, "previousLevelId");
    if (input.assessed !== true) throw new Error("A saved practice assessment must be assessed.");
    this.assessed = true;
    for (const key of ["levelChanged", "isFrameworkCompleted"]) {
      if (typeof input[key] !== "boolean") throw new Error(key + " must be a boolean.");
      this[key] = input[key];
    }
    if (typeof input.practiceType !== "string" || !input.practiceType.trim()) throw new Error("practiceType is required.");
    this.practiceType = input.practiceType;
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) throw new Error("score must be from 0 to 100.");
    this.score = input.score;
    for (const key of ["reason", "levelName"]) {
      if (input[key] !== null && typeof input[key] !== "string") throw new Error(key + " must be a string or null.");
      this[key] = input[key];
    }
    if (!Array.isArray(input.reachedLevelIds)) throw new Error("reachedLevelIds must be an array.");
    this.reachedLevelIds = Object.freeze(input.reachedLevelIds.map(value => requireId(value, "reachedLevelId")));
    if (new Set(this.reachedLevelIds).size !== this.reachedLevelIds.length
        || this.reachedLevelIds.includes(this.previousLevelId)
        || (!this.levelChanged && this.reachedLevelIds.length)
        || (this.reachedLevelIds.length && this.reachedLevelIds.at(-1) !== this.levelId)) {
      throw new Error("The saved assessment level transition is inconsistent.");
    }
    const date = input.assessedAt instanceof Date ? input.assessedAt : input.assessedAt?.toDate?.();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("assessedAt must be a timestamp.");
    this.assessedAt = new Date(date.getTime());
    for (const key of ["eligiblePracticeCount", "qualifyingPracticeCount", "requiredPracticeCount"]) {
      if (input[key] === undefined) continue;
      if (!Number.isSafeInteger(input[key]) || input[key] < 0) throw new Error(key + " must be a nonnegative integer.");
      this[key] = input[key];
    }
    if (input.minimumScore !== undefined) {
      if (!Number.isFinite(input.minimumScore) || input.minimumScore < 0 || input.minimumScore > 100) throw new Error("minimumScore must be from 0 to 100.");
      this.minimumScore = input.minimumScore;
    }
    Object.freeze(this);
  }
}

export {PracticeAssessment, requirePracticeAssessmentScope};
