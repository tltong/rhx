const {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkPreAssessmentDifficultyLevels,
  assessmentFrameworkPreAssessmentScoreBands,
} = require("../../../schema/assessment_framework_schema");

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

function requirePositiveInteger(value, name) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return numberValue;
}

function normalizePercentage(value, name) {
  const percentage = requireFiniteNumber(value, name);

  if (percentage < 0 || percentage > 100) {
    throw new Error(`${name} must be between 0 and 100.`);
  }

  return percentage;
}

function normalizeDifficultySplit(difficultySplit) {
  if (
    !difficultySplit ||
    typeof difficultySplit !== "object" ||
    Array.isArray(difficultySplit)
  ) {
    throw new Error("difficultySplit must be an object.");
  }

  const normalizedSplit = Object.fromEntries(
    assessmentFrameworkPreAssessmentDifficultyLevels.map((difficulty) => {
      const field = `${difficulty}Percentage`;

      return [
        field,
        normalizePercentage(
          difficultySplit[field],
          `difficultySplit.${field}`,
        ),
      ];
    }),
  );
  const total = Object.values(normalizedSplit).reduce(
    (sum, percentage) => sum + percentage,
    0,
  );

  if (Math.abs(total - 100) > 0.0001) {
    throw new Error("Difficulty percentages must total 100.");
  }

  return Object.freeze(normalizedSplit);
}

function normalizeScoreLevelSplit(scoreLevelSplit) {
  if (
    !scoreLevelSplit ||
    typeof scoreLevelSplit !== "object" ||
    Array.isArray(scoreLevelSplit)
  ) {
    throw new Error("scoreLevelSplit must be an object.");
  }

  return Object.freeze(Object.fromEntries(
    assessmentFrameworkPreAssessmentScoreBands.map(({field}) => [
      field,
      requireNonEmptyString(
        scoreLevelSplit[field],
        `scoreLevelSplit.${field}`,
      ),
    ]),
  ));
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

class AssessmentFrameworkPreAssessment {
  constructor({
    numberOfQuestions,
    difficultySplit,
    scoreLevelSplit,
  }) {
    this.numberOfQuestions = requirePositiveInteger(
      numberOfQuestions,
      "numberOfQuestions",
    );
    this.difficultySplit = normalizeDifficultySplit(difficultySplit);
    this.scoreLevelSplit = normalizeScoreLevelSplit(scoreLevelSplit);

    Object.freeze(this);
  }
}

class AssessmentFramework {
  constructor({
    id,
    name,
    endLevelName,
    levels = [],
    preAssessment = null,
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
    this.preAssessment = preAssessment === null
      ? null
      : preAssessment instanceof AssessmentFrameworkPreAssessment
        ? preAssessment
        : new AssessmentFrameworkPreAssessment(preAssessment);

    if (this.preAssessment) {
      const validLevelIds = new Set([
        ...this.levels.map((level) => level.id),
        ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
      ]);

      Object.entries(this.preAssessment.scoreLevelSplit).forEach(
        ([field, levelId]) => {
          if (!validLevelIds.has(levelId)) {
            throw new Error(
              `scoreLevelSplit.${field} references an unknown level.`,
            );
          }
        },
      );
    }

    Object.freeze(this);
  }
}

module.exports = {
  AssessmentFramework,
  AssessmentFrameworkLevel,
  AssessmentFrameworkPreAssessment,
};
