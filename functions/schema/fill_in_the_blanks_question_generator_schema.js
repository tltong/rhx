const FILL_IN_THE_BLANKS_TYPE = "fillInTheBlanks";
const FILL_IN_THE_BLANKS_GENERATOR = "fillInTheBlanksQuestionGenerator";
const FILL_IN_THE_BLANKS_QUESTIONS = "fillInTheBlanksQuestions";
const FILL_IN_THE_BLANKS_LEVELS = Object.freeze(["primary", "secondary"]);
const FILL_IN_THE_BLANKS_DIFFICULTIES = Object.freeze(["easy", "medium", "hard"]);
const fillInTheBlanksGeneratorConfigSchema = {
  collection: FILL_IN_THE_BLANKS_GENERATOR, documentId: "config",
  fields: {additionalLlmInstructions: "string", gradeSettings: "map[level][grade]: {questionsPerPassage, imageEnabled, additionalLlmInstructions}",
    difficultyInstructions: "map[easy|medium|hard]: string", summaryHistory: "{mode: recent|all, count: integer}",
    updatedAt: "timestamp", updatedBy: "string"},
};
const fillInTheBlanksPassageSchema = {
  collection: "fillInTheBlanksQuestions/{syllabusId}/topics/{topicId}/languages/{languageId}/passages",
  documentId: "{passageId}",
  fields: {format: "fillInTheBlanks", syllabusId: "string", topicId: "string", language: "string",
    level: "primary|secondary", grade: "integer", subject: "string", country: "string", topicName: "string", difficulty: "easy|medium|hard", passageText: "string",
    summary: "string", questionCount: "integer", imagePrompt: "string|null", image: "{storagePath,url}|null",
    imageStatus: "disabled|generated|failed", generatedAt: "timestamp", settings: "map"},
  subcollections: {
    questionItems: {documentId: "{questionId}", fields: {position: "integer", requiredWordCount: "integer", requiredCharacterCount: {type: "integer", optional: true, description: "Chinese answer length in Unicode letters/numbers; spaces and punctuation excluded"}}},
    private: {documentId: "answerKey", fields: {answers: "map[questionId]: model answer; backend/admin only"}},
  },
};
const fillInTheBlanksDraftSchema = {collection: "fillInTheBlanksDrafts", documentId: "{passageId}",
  fields: {draft: "map; includes protected answers", createdAt: "timestamp", createdBy: "string"}};
const fillInTheBlanksPassageAssetSchema = {collection: "fillInTheBlanksPassageAssets", documentId: "{passageId}",
  fields: {hash: "string", state: "generating|ready|failed", image: "{storagePath,url} (when ready)", createdAt: "timestamp", completedAt: "timestamp (when finished)"}};
module.exports = {FILL_IN_THE_BLANKS_TYPE, FILL_IN_THE_BLANKS_GENERATOR, FILL_IN_THE_BLANKS_QUESTIONS,
  FILL_IN_THE_BLANKS_LEVELS, FILL_IN_THE_BLANKS_DIFFICULTIES, fillInTheBlanksGeneratorConfigSchema,
  fillInTheBlanksPassageSchema, fillInTheBlanksDraftSchema, fillInTheBlanksPassageAssetSchema};
