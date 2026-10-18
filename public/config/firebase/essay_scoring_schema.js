export const ESSAY_RESULTS_COLLECTION = "essayResults";
export const ESSAY_RESULT_QUESTIONS_SUBCOLLECTION = "questions";

export const essayResultsSchema = {
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
        scoredAt: "timestamp"
      }
    }
  }
};

export default {ESSAY_RESULTS_COLLECTION, ESSAY_RESULT_QUESTIONS_SUBCOLLECTION, essayResultsSchema};

