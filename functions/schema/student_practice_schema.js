const STUDENT_PRACTICES_COLLECTION = "studentPractices";
const ASSIGNED_PRACTICES_SUBCOLLECTION = "assignedPractices";
const COMPLETED_PRACTICES_SUBCOLLECTION = "completedPractices";

const studentPracticeDocumentIdPattern = "[student_id]";
const assignedPracticeDocumentIdPattern = "[practice_id]";
const completedPracticeDocumentIdPattern = "[practice_id]";
const completedPracticeQuestionIdPattern = "[question_id]";

const studentPracticeSchema = {
  collection: STUDENT_PRACTICES_COLLECTION,
  documentId: studentPracticeDocumentIdPattern,
  fields: {},
  subcollections: {
    assignedPractices: {
      collection: ASSIGNED_PRACTICES_SUBCOLLECTION,
      documentId: assignedPracticeDocumentIdPattern,
      fields: {}
    },
    completedPractices: {
      collection: COMPLETED_PRACTICES_SUBCOLLECTION,
      documentId: completedPracticeDocumentIdPattern,
      fields: {
        dateCompleted: "timestamp",
        questionsCorrect: "number",
        totalQuestions: "number",
        score: "number",
        timeTakenSeconds: "number",
        studentAnswers: {
          type: "map",
          entries: {
            [completedPracticeQuestionIdPattern]: {
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
  STUDENT_PRACTICES_COLLECTION,
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  COMPLETED_PRACTICES_SUBCOLLECTION,
  studentPracticeDocumentIdPattern,
  assignedPracticeDocumentIdPattern,
  completedPracticeDocumentIdPattern,
  completedPracticeQuestionIdPattern,
  studentPracticeSchema
};
