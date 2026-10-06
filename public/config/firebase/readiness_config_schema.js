export const READINESS_CONFIGS_COLLECTION = "readinessConfigs";
export const READINESS_CONFIG_DOCUMENT_ID = "default";

export const DifficultyLevel = Object.freeze({
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
});
export const difficultyLevels = Object.freeze(Object.values(DifficultyLevel));
export const DEFAULT_DIFFICULTY_WEIGHTS = Object.freeze({
  [DifficultyLevel.EASY]: 0.75,
  [DifficultyLevel.MEDIUM]: 1,
  [DifficultyLevel.HARD]: 1.75,
});
export const DEFAULT_NUMBER_OF_PRACTICES = 5;
export const DEFAULT_PRE_ASSESSMENT_WEIGHT = 1;

export const readinessDifficultySchema = {
  type: "string",
  enum: difficultyLevels,
};
export const readinessConfigSchema = {
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

export default {
  READINESS_CONFIGS_COLLECTION,
  READINESS_CONFIG_DOCUMENT_ID,
  DifficultyLevel,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
  readinessDifficultySchema,
  readinessConfigSchema,
};
