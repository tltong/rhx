const {
  DifficultyLevel,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
} = require("../../../schema/readiness_config_schema");

const DIFFICULTY_VALUES = Object.values(DifficultyLevel);

function normalizeDifficultyLevel(value) {
  const difficulty = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!DIFFICULTY_VALUES.includes(difficulty)) {
    throw new Error("difficultyLevel must be easy, medium, or hard.");
  }
  return difficulty;
}

function requireDifficultyWeight(value, difficulty) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${difficulty} weight must be a finite number greater than zero.`);
  }
  return value;
}

function normalizeDifficultyWeights(weights) {
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
    throw new Error("difficultyWeights must be a map containing easy, medium, and hard.");
  }
  const keys = Object.keys(weights);
  if (keys.length !== DIFFICULTY_VALUES.length
      || keys.some((key) => !DIFFICULTY_VALUES.includes(key))) {
    throw new Error("difficultyWeights must contain exactly easy, medium, and hard.");
  }
  return Object.freeze(Object.fromEntries(DIFFICULTY_VALUES.map((difficulty) => [
    difficulty,
    requireDifficultyWeight(weights[difficulty], difficulty),
  ])));
}

function requireNumberOfPractices(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("numberOfPractices must be a positive integer.");
  }
  return value;
}

function normalizeReadinessConfigChanges(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Readiness configuration must be an object.");
  }
  const changes = {};
  if (Object.hasOwn(input, "difficultyWeights")) {
    changes.difficultyWeights = normalizeDifficultyWeights(input.difficultyWeights);
  }
  if (Object.hasOwn(input, "numberOfPractices")) {
    changes.numberOfPractices = requireNumberOfPractices(input.numberOfPractices);
  }
  if (Object.hasOwn(input, "preAssessmentWeight")) {
    changes.preAssessmentWeight = requireDifficultyWeight(input.preAssessmentWeight, "pre-assessment");
  }
  if (Object.keys(changes).length === 0) {
    throw new Error("Provide difficultyWeights, numberOfPractices, or preAssessmentWeight.");
  }
  return changes;
}

function requireAdministratorUid(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("updatedBy must be an administrator UID.");
  }
  return value.trim();
}

function normalizeUpdatedAt(value) {
  const date = value instanceof Date ? value
    : typeof value?.toDate === "function" ? value.toDate()
      : typeof value === "string" ? new Date(value) : null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("updatedAt must be a valid timestamp.");
  }
  return date;
}

class ReadinessConfig {
  constructor({
    difficultyWeights,
    numberOfPractices = DEFAULT_NUMBER_OF_PRACTICES,
    preAssessmentWeight = DEFAULT_PRE_ASSESSMENT_WEIGHT,
    updatedAt,
    updatedBy,
  }) {
    this.difficultyWeights = normalizeDifficultyWeights(difficultyWeights);
    this.numberOfPractices = requireNumberOfPractices(numberOfPractices);
    this.preAssessmentWeight = requireDifficultyWeight(preAssessmentWeight, "pre-assessment");
    this.updatedAt = normalizeUpdatedAt(updatedAt);
    this.updatedBy = requireAdministratorUid(updatedBy);
    Object.freeze(this);
  }
}

module.exports = {
  ReadinessConfig,
  normalizeDifficultyLevel,
  normalizeDifficultyWeights,
  normalizeReadinessConfigChanges,
  requireNumberOfPractices,
  requireDifficultyWeight,
  requireAdministratorUid,
};
