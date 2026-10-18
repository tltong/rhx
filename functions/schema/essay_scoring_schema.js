const ESSAY_RESULTS_COLLECTION = "essayResults";
const ESSAY_RESULT_QUESTIONS_SUBCOLLECTION = "questions";

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

module.exports = {ESSAY_RESULTS_COLLECTION, ESSAY_RESULT_QUESTIONS_SUBCOLLECTION, essayResultsSchema};

