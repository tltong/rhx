const TUTOR_COLLECTION = "tutor";
const TUTOR_CONFIG_DOCUMENT_ID = "config";
const TUTOR_COUNTS_SUBCOLLECTION = "counts";
const TUTOR_LANGUAGES_SUBCOLLECTION = "languages";
const DEFAULT_TUTOR_MINI_QUESTION_COUNT = 3;

const feedbackMessageMapSchema = {
  type: "map",
  keys: "[language]",
  minProperties: 1,
  values: {type: "string", minLength: 1},
};

const tutorConfigSchema = {
  collection: TUTOR_COLLECTION,
  documentId: TUTOR_CONFIG_DOCUMENT_ID,
  fields: {
    miniQuestionCount: {
      type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER,
      default: DEFAULT_TUTOR_MINI_QUESTION_COUNT,
    },
    promptInstructions: "string",
    correctAnswerMessage: feedbackMessageMapSchema,
    incorrectAnswerMessage: feedbackMessageMapSchema,
    updatedAt: "timestamp",
    updatedBy: "string",
  },
};

// One reusable set per original question ID, count and encoded language.
const tutorMiniQuestionSetSchema = {
  collection: "tutor/[questionId]/counts/[miniQuestionCount]/languages",
  documentId: "[languageId]",
  fields: {
    questionId: "string",
    language: "string",
    miniQuestionCount: {type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
    miniQuestions: {
      type: "array",
      items: {
        type: "map",
        fields: {
          sequence: {type: "integer", minimum: 1},
          questionText: "string",
          expectedAnswer: "string",
          acceptedAnswers: {type: "array", items: "string"},
          answerExplanation: "string",
        },
      },
    },
    configUpdatedAt: "timestamp",
    generatedAt: "timestamp",
  },
};

module.exports = {TUTOR_COLLECTION, TUTOR_CONFIG_DOCUMENT_ID, TUTOR_COUNTS_SUBCOLLECTION, TUTOR_LANGUAGES_SUBCOLLECTION, DEFAULT_TUTOR_MINI_QUESTION_COUNT, tutorConfigSchema, tutorMiniQuestionSetSchema};

