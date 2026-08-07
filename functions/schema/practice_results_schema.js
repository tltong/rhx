const PRACTICE_RESULTS_COLLECTION = "practiceResults";
const STUDENT_SUBMISSIONS_SUBCOLLECTION = "studentSubmissions";

const practiceResultDocumentIdPattern = "[practice_id]";
const practiceResultStudentDocumentIdPattern = "[student_id]";
const practiceResultQuestionIdPattern = "[question_id]";

const practiceResultsSchema = {
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

module.exports = {
  PRACTICE_RESULTS_COLLECTION,
  STUDENT_SUBMISSIONS_SUBCOLLECTION,
  practiceResultDocumentIdPattern,
  practiceResultStudentDocumentIdPattern,
  practiceResultQuestionIdPattern,
  practiceResultsSchema
};
