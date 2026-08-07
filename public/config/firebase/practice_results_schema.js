export const PRACTICE_RESULTS_COLLECTION = "practiceResults";
export const STUDENT_SUBMISSIONS_SUBCOLLECTION = "studentSubmissions";

export const practiceResultDocumentIdPattern = "[practice_id]";
export const practiceResultStudentDocumentIdPattern = "[student_id]";
export const practiceResultQuestionIdPattern = "[question_id]";

export const practiceResultsSchema = {
  collection: PRACTICE_RESULTS_COLLECTION,
  documentId: practiceResultDocumentIdPattern,
  fields: {},
  subcollections: {
    studentSubmissions: {
      collection: STUDENT_SUBMISSIONS_SUBCOLLECTION,
      documentId: practiceResultStudentDocumentIdPattern,
      fields: {
        submittedAt: "timestamp",
        timeTakenSeconds: "number",
        questionsCorrect: "number",
        totalQuestions: "number",
        score: "number",
        answers: {
          type: "map",
          entries: {
            [practiceResultQuestionIdPattern]: {
              type: "map",
              fields: {
                selectedOption: "string",
                correctAnswer: "string",
                isCorrect: "boolean"
              }
            }
          }
        }
      }
    }
  }
};

export default {
  PRACTICE_RESULTS_COLLECTION,
  STUDENT_SUBMISSIONS_SUBCOLLECTION,
  practiceResultDocumentIdPattern,
  practiceResultStudentDocumentIdPattern,
  practiceResultQuestionIdPattern,
  practiceResultsSchema
};
