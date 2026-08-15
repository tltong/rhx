function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeDate(value, fieldName) {
  const dateValue = value && typeof value.toDate === "function"
    ? value.toDate()
    : value;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

function normalizeLevelHistory(levelHistory = {}) {
  if (
    !levelHistory ||
    typeof levelHistory !== "object" ||
    Array.isArray(levelHistory)
  ) {
    throw new Error("levelHistory must be an object.");
  }

  return Object.freeze(Object.fromEntries(
    Object.entries(levelHistory).map(([levelIdValue, reachedAt]) => {
      const levelId = requireIdentifier(levelIdValue, "levelHistory.levelId");

      return [levelId, normalizeDate(
        reachedAt,
        `levelHistory.${levelId}`
      )];
    })
  ));
}

export class StudentAssessmentTopicProgress {
  constructor({
    studentId,
    syllabusId,
    topicId,
    initialLevel,
    currentLevelId,
    isFrameworkCompleted = false,
    levelHistory = {}
  } = {}) {
    if (!initialLevel || typeof initialLevel !== "object") {
      throw new Error("initialLevel is required.");
    }

    this.studentId = requireIdentifier(studentId, "studentId");
    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.topicId = requireIdentifier(topicId, "topicId");
    this.initialLevel = Object.freeze({
      levelId: requireIdentifier(initialLevel.levelId, "initialLevel.levelId"),
      setAt: normalizeDate(initialLevel.setAt, "initialLevel.setAt")
    });
    this.currentLevelId = requireIdentifier(
      currentLevelId,
      "currentLevelId"
    );

    if (typeof isFrameworkCompleted !== "boolean") {
      throw new Error("isFrameworkCompleted must be a boolean.");
    }

    this.isFrameworkCompleted = isFrameworkCompleted;
    this.levelHistory = normalizeLevelHistory(levelHistory);

    Object.freeze(this);
  }
}
