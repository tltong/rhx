const ESSAY_RESULTS_COLLECTION = "essayResults";
const ESSAY_RESULT_QUESTIONS_SUBCOLLECTION = "questions";
const ESSAY_SCORING_CONFIG_COLLECTION = "essayScoring";
const ESSAY_SCORING_CONFIG_DOCUMENT_ID = "config";
const ESSAY_SCORING_LEVELS = Object.freeze(["primary", "secondary"]);
const ESSAY_SCORING_GRADES = Object.freeze([1, 2, 3, 4, 5, 6]);
const essayScoringConfigSchema = {
  collection: ESSAY_SCORING_CONFIG_COLLECTION,
  documentId: ESSAY_SCORING_CONFIG_DOCUMENT_ID,
  fields: {
    markingInstructions: "string",
    additionalLlmInstructions: "string",
    gradeInstructions: {type: "map", fields: Object.fromEntries(ESSAY_SCORING_LEVELS.map(level => [level,
      {type: "map", fields: Object.fromEntries(ESSAY_SCORING_GRADES.map(grade => [String(grade), "string"]))}]))},
    updatedAt: "timestamp",
    updatedBy: "string",
  },
};

const essayResultsSchema = {
  collection: ESSAY_RESULTS_COLLECTION,
  documentId: "[studentId]",
  fields: {},
  subcollections: {
    questions: {
      collection: ESSAY_RESULT_QUESTIONS_SUBCOLLECTION,
      documentId: "[questionId]",
      fields: {
        answer: "string",
        score: {type: "number", minimum: 0, maximum: 100},
        reviewComment: {type: "string", optional: true}, // Required on new writes; absent in legacy results.
        corrections: {
          type: "array",
          items: {
            type: "map",
            fields: {
              originalText: "string",
              correctedText: "string",
              explanation: "string"
            }
          }
        },
        scoredAt: "timestamp",
        submittedAt: {type: "timestamp", optional: true}
      }
    }
  }
};

module.exports = {ESSAY_RESULTS_COLLECTION, ESSAY_RESULT_QUESTIONS_SUBCOLLECTION, essayResultsSchema,
  ESSAY_SCORING_CONFIG_COLLECTION, ESSAY_SCORING_CONFIG_DOCUMENT_ID, ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES, essayScoringConfigSchema};

