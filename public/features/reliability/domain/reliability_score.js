function requireIdentifier(value, fieldName) {
  if (typeof value !== "string" || !value.trim()
      || value.includes("/") || value.trim() === "." || value.trim() === "..") {
    throw new Error(fieldName + " must be a non-empty document ID without slashes.");
  }
  return value.trim();
}

function requireSubjectScope(input) {
  return {
    studentId: requireIdentifier(input?.studentId, "studentId"),
    syllabusId: requireIdentifier(input?.syllabusId, "syllabusId"),
  };
}

function requireTopicScope(input) {
  return {
    ...requireSubjectScope(input),
    topicId: requireIdentifier(input?.topicId, "topicId"),
  };
}

function requireReliabilityScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("score must be a finite number between 0 and 100.");
  }
  return value;
}

function requireCompletedPracticeCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("completedPracticeCount must be a non-negative safe integer.");
  }
  return value;
}

function requireTimestamp(value, fieldName) {
  const date = value instanceof Date ? value
    : typeof value?.toDate === "function" ? value.toDate()
      : typeof value === "string" ? new Date(value) : null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(fieldName + " must be a valid timestamp.");
  }
  return date;
}

class TopicReliabilityScore {
  constructor({score, completedPracticeCount, updatedAt}) {
    this.score = requireReliabilityScore(score);
    this.completedPracticeCount = requireCompletedPracticeCount(completedPracticeCount);
    this.updatedAt = requireTimestamp(updatedAt, "updatedAt");
    Object.freeze(this);
  }
}

class SubjectReliabilityScore {
  constructor({score, updatedAt}) {
    this.score = requireReliabilityScore(score);
    this.updatedAt = requireTimestamp(updatedAt, "updatedAt");
    Object.freeze(this);
  }
}

export {
  requireIdentifier, requireSubjectScope, requireTopicScope,
  requireReliabilityScore, requireCompletedPracticeCount, requireTimestamp,
  TopicReliabilityScore, SubjectReliabilityScore,
};
