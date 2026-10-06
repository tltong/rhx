
function requireIdentifier(value, fieldName) {
  if (typeof value !== "string" || !value.trim()
      || value.includes("/") || value.trim() === "." || value.trim() === "..") {
    throw new Error(`${fieldName} must be a non-empty document ID without slashes.`);
  }
  return value.trim();
}

function requireTopicScope(input) {
  return {
    studentId: requireIdentifier(input?.studentId, "studentId"),
    syllabusId: requireIdentifier(input?.syllabusId, "syllabusId"),
    topicId: requireIdentifier(input?.topicId, "topicId"),
  };
}

function requireReadinessScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("score must be a finite, non-negative number.");
  }
  // Difficulty weights can produce readiness scores greater than 100.
  return value;
}

function normalizeSourcePracticeId(value) {
  return value === undefined || value === null
    ? null : requireIdentifier(value, "practiceId");
}

function requireTimestamp(value, fieldName) {
  const date = value instanceof Date ? value
    : typeof value?.toDate === "function" ? value.toDate()
      : typeof value === "string" ? new Date(value) : null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }
  return date;
}

class ReadinessScore {
  constructor({score, updatedAt}) {
    this.score = requireReadinessScore(score);
    this.updatedAt = requireTimestamp(updatedAt, "updatedAt");
    Object.freeze(this);
  }
}

class ReadinessScoreHistoryEntry {
  constructor({id, score, savedAt, practiceId}) {
    this.id = requireIdentifier(id, "history entry ID");
    this.score = requireReadinessScore(score);
    this.savedAt = requireTimestamp(savedAt, "savedAt");
    const sourcePracticeId = normalizeSourcePracticeId(practiceId);
    if (sourcePracticeId !== null) {
      this.practiceId = sourcePracticeId;
    }
    Object.freeze(this);
  }
}

export {requireTopicScope, requireReadinessScore, requireTimestamp, normalizeSourcePracticeId, ReadinessScore, ReadinessScoreHistoryEntry};
