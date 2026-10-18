const ESSAY_QUESTION_GENERATOR_COLLECTION = "essayQuestionGenerator";
const ESSAY_QUESTION_CONFIG_DOCUMENT_ID = "config";
const ESSAY_QUESTION_INDEX_DOCUMENT_ID = "questionIndex";
const ESSAY_QUESTION_LEVELS = Object.freeze({PRIMARY: "primary", SECONDARY: "secondary"});
const ESSAY_QUESTION_STANDARDS = Object.freeze([1, 2, 3, 4, 5, 6]);
const ESSAY_QUESTION_DIFFICULTIES = Object.freeze({EASY: "easy", MEDIUM: "medium", HARD: "hard"});

const gradeInstructionFields = Object.fromEntries(ESSAY_QUESTION_STANDARDS.map(standard =>
  [String(standard), {type: "string", default: ""}]));
const wordCountRequirementSchema = {
  type: "map", fields: {minWords: {type: "integer", nullable: true, minimum: 1, default: null}},
};
const essayQuestionGeneratorConfigSchema = {
  collection: ESSAY_QUESTION_GENERATOR_COLLECTION,
  documentId: ESSAY_QUESTION_CONFIG_DOCUMENT_ID,
  fields: {
    additionalLlmInstructions: {type: "string", default: ""},
    gradeInstructions: {type: "map", fields: Object.fromEntries(Object.values(ESSAY_QUESTION_LEVELS).map(level =>
      [level, {type: "map", fields: gradeInstructionFields}]))},
    gradeWordCountRequirements: {type: "map", fields: Object.fromEntries(Object.values(ESSAY_QUESTION_LEVELS).map(level =>
      [level, {type: "map", fields: Object.fromEntries(ESSAY_QUESTION_STANDARDS.map(standard =>
        [String(standard), wordCountRequirementSchema]))}]))},
    difficultyInstructions: {type: "map", fields: Object.fromEntries(Object.values(ESSAY_QUESTION_DIFFICULTIES).map(difficulty =>
      [difficulty, {type: "string", default: ""}]))},
    updatedAt: "timestamp",
    updatedBy: "string",
  },
};
const essayQuestionSchema = {
  collection: "essayQuestionGenerator/[level]/standards/[standard]/languages/[languageId]/questions",
  documentId: "[questionId]",
  fields: {
    questionText: "string",
    difficulty: {type: "string", enum: Object.values(ESSAY_QUESTION_DIFFICULTIES)},
    seedUsed: "string",
    wordCountRequirement: wordCountRequirementSchema,
    generatedAt: "timestamp",
  },
};
const essayQuestionIndexSchema = {
  collection: "essayQuestionGenerator/questionIndex/entries",
  documentId: "[questionId]",
  fields: {documentPath: "string"},
};

export {ESSAY_QUESTION_GENERATOR_COLLECTION, ESSAY_QUESTION_CONFIG_DOCUMENT_ID, ESSAY_QUESTION_INDEX_DOCUMENT_ID, ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES, essayQuestionGeneratorConfigSchema, essayQuestionSchema, essayQuestionIndexSchema};
