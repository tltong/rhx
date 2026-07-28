function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function requireFiniteNumber(value, name) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${name} must be a finite number.`);
  }

  return numberValue;
}

function normalizeCriteria(criteria) {
  if (
    criteria === null ||
    typeof criteria !== "object" ||
    Array.isArray(criteria)
  ) {
    throw new Error("criteria must be an object.");
  }

  return Object.freeze({
    requiredPracticeCount: requireFiniteNumber(
      criteria.requiredPracticeCount,
      "criteria.requiredPracticeCount",
    ),
    minimumScore: requireFiniteNumber(
      criteria.minimumScore,
      "criteria.minimumScore",
    ),
    questionsPerPractice: requireFiniteNumber(
      criteria.questionsPerPractice,
      "criteria.questionsPerPractice",
    ),
    difficultyLevel: requireNonEmptyString(
      criteria.difficultyLevel,
      "criteria.difficultyLevel",
    ),
  });
}

class AssessmentFrameworkLevel {
  constructor({
    id,
    levelName,
    sequenceOrder,
    criteria,
  }) {
    this.id = requireNonEmptyString(id, "level id");
    this.levelName = requireNonEmptyString(levelName, "levelName");
    this.sequenceOrder = requireFiniteNumber(
      sequenceOrder,
      "sequenceOrder",
    );
    this.criteria = normalizeCriteria(criteria);

    Object.freeze(this);
  }
}

class AssessmentFramework {
  constructor({
    id,
    name,
    endLevelName,
    levels = [],
  }) {
    if (!Array.isArray(levels)) {
      throw new Error("levels must be an array.");
    }

    this.id = requireNonEmptyString(id, "assessment framework id");
    this.name = requireNonEmptyString(name, "name");
    this.endLevelName = requireNonEmptyString(
      endLevelName,
      "endLevelName",
    );
    this.levels = Object.freeze(
      levels
        .map((level) =>
          level instanceof AssessmentFrameworkLevel
            ? level
            : new AssessmentFrameworkLevel(level),
        )
        .sort((first, second) =>
          first.sequenceOrder - second.sequenceOrder,
        ),
    );

    Object.freeze(this);
  }
}

module.exports = {
  AssessmentFramework,
  AssessmentFrameworkLevel,
};
