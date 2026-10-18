const QUESTION_SEED_GENERATOR_COLLECTION = "questionSeedGenerator";
const QUESTION_SEED_GENERATOR_CONFIG_DOCUMENT_ID = "config";
const DEFAULT_QUESTION_GENERATION_SEED = "latest news";
const QUESTION_SEED_VERTICALS = Object.freeze({
  THEME: "theme", SETTING: "setting", TYPE: "type",
});
const QUESTION_SEED_LEVELS = Object.freeze({PRIMARY: "primary", SECONDARY: "secondary"});
const QUESTION_SEED_GRADES = Object.freeze([1, 2, 3, 4, 5, 6]);

const questionSeedGeneratorConfigSchema = {
  collection: QUESTION_SEED_GENERATOR_COLLECTION,
  documentId: QUESTION_SEED_GENERATOR_CONFIG_DOCUMENT_ID,
  fields: {
    generationSeed: {type: "string", default: DEFAULT_QUESTION_GENERATION_SEED},
    additionalLlmInstructions: {type: "string", default: ""},
    updatedAt: "timestamp",
    updatedBy: "string",
  },
};

const questionSeedEntriesSchema = {
  collection: QUESTION_SEED_GENERATOR_COLLECTION,
  documentId: "[vertical]",
  documentIds: Object.values(QUESTION_SEED_VERTICALS),
  fields: {entries: {type: "array", items: {
    type: "map", fields: {
      value: "string",
      associations: {
        type: "map", allowedKeys: Object.values(QUESTION_SEED_LEVELS),
        values: {type: "array", uniqueItems: true, items: {type: "integer", minimum: 1, maximum: 6}},
      },
    },
  }}},
};

export {
  QUESTION_SEED_GENERATOR_COLLECTION, QUESTION_SEED_GENERATOR_CONFIG_DOCUMENT_ID,
  DEFAULT_QUESTION_GENERATION_SEED, QUESTION_SEED_VERTICALS, QUESTION_SEED_LEVELS, QUESTION_SEED_GRADES,
  questionSeedGeneratorConfigSchema, questionSeedEntriesSchema,
};
