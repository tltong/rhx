// Catalog IDs are references, never a fixed enum in grade configuration.
const ESSAY_TYPES_COLLECTION = "essayTypes";
const ESSAY_GRADE_CONFIGS_COLLECTION = "essayGradeConfigs";
const ESSAY_CONFIG_COLLECTION = "essayConfig";
const ESSAY_CONFIG_DOCUMENT_ID = "settings";
const essayTypeSchema = {collection: ESSAY_TYPES_COLLECTION, documentId: "{essayTypeId}", fields: {
  name: "string", llmInstructions: "string", gradeInstructions: "map<gradeDocumentId,string>",
  pictureRequirement: "optional|required", pictureFrameCount: "integer 1..12", updatedAt: "timestamp", updatedBy: "uid",
}};
const essayGradeConfigSchema = {collection: ESSAY_GRADE_CONFIGS_COLLECTION, documentId: "{level}_{standard}", fields: {
  level: "primary|secondary", standard: "integer 1..6", additionalLlmInstructions: "string",
  wordCountRequirement: {minWords: "positive integer|null"}, helpingWordsEnabled: "boolean", helpingWordCount: "integer 1..30",
  essayTypes: [{essayTypeId: "reference to essayTypes document ID", pictureEnabled: "boolean"}],
  updatedAt: "timestamp", updatedBy: "uid",
}};
const essayConfigSchema = {collection: ESSAY_CONFIG_COLLECTION, documentId: ESSAY_CONFIG_DOCUMENT_ID, fields: {
  schemaVersion: 1, version: "integer", additionalLlmInstructions: "string",
  difficultyInstructions: {easy: "string", medium: "string", hard: "string"}, updatedAt: "timestamp", updatedBy: "uid",
}};
module.exports = {ESSAY_TYPES_COLLECTION, ESSAY_GRADE_CONFIGS_COLLECTION, ESSAY_CONFIG_COLLECTION, ESSAY_CONFIG_DOCUMENT_ID,
  essayTypeSchema, essayGradeConfigSchema, essayConfigSchema};
