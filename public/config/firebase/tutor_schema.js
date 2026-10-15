const TUTOR_COLLECTION = "tutor";
const TUTOR_CONFIG_DOCUMENT_ID = "config";
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

// Set IDs are "set-" plus SHA-256 of JSON.stringify([questionId, language]).
// Each language has an independent reusable set in the same tutor collection.
const tutorMiniQuestionSetSchema = {
  collection: TUTOR_COLLECTION,
  documentId: "set-[question_id_and_language_sha256]",
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

export {TUTOR_COLLECTION, TUTOR_CONFIG_DOCUMENT_ID, DEFAULT_TUTOR_MINI_QUESTION_COUNT, tutorConfigSchema, tutorMiniQuestionSetSchema};

