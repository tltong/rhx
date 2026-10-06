const READINESS_CONFIGS_COLLECTION = "readinessConfigs";
const READINESS_CONFIG_DOCUMENT_ID = "default";

const DifficultyLevel = Object.freeze({
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
});
const difficultyLevels = Object.freeze(Object.values(DifficultyLevel));
const DEFAULT_DIFFICULTY_WEIGHTS = Object.freeze({
  [DifficultyLevel.EASY]: 0.75,
  [DifficultyLevel.MEDIUM]: 1,
  [DifficultyLevel.HARD]: 1.75,
});
const DEFAULT_NUMBER_OF_PRACTICES = 5;
const DEFAULT_PRE_ASSESSMENT_WEIGHT = 1;

const readinessDifficultySchema = {
  type: "string",
  enum: difficultyLevels,
};
const readinessConfigSchema = {
  collection: READINESS_CONFIGS_COLLECTION,
  documentId: READINESS_CONFIG_DOCUMENT_ID,
  fields: {
    numberOfPractices: {
      type: "integer",
      minimum: 1,
      default: DEFAULT_NUMBER_OF_PRACTICES,
    },
    preAssessmentWeight: {
      type: "number",
      exclusiveMinimum: 0,
      default: DEFAULT_PRE_ASSESSMENT_WEIGHT,
    },
    difficultyWeights: {
      type: "map",
      allowedKeys: difficultyLevels,
      requiredKeys: difficultyLevels,
      fields: Object.fromEntries(difficultyLevels.map((difficulty) => [
        difficulty,
        {type: "number", exclusiveMinimum: 0},
      ])),
    },
    updatedAt: "timestamp",
    updatedBy: "string",
  },
};

module.exports = {
  READINESS_CONFIGS_COLLECTION,
  READINESS_CONFIG_DOCUMENT_ID,
  DifficultyLevel,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
  readinessDifficultySchema,
  readinessConfigSchema,
};
