export const STUDENT_PRACTICES_COLLECTION = "studentPractices";
export const ASSIGNED_PRACTICES_SUBCOLLECTION = "assignedPractices";
export const COMPLETED_PRACTICES_SUBCOLLECTION = "completedPractices";

export const studentPracticeDocumentIdPattern = "[student_id]";
export const assignedPracticeDocumentIdPattern = "[practice_id]";
export const completedPracticeDocumentIdPattern = "[practice_id]";
export const completedPracticeQuestionIdPattern = "[question_id]";

export const studentPracticeSchema = {
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

export default {
  STUDENT_PRACTICES_COLLECTION,
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  COMPLETED_PRACTICES_SUBCOLLECTION,
  studentPracticeDocumentIdPattern,
  assignedPracticeDocumentIdPattern,
  completedPracticeDocumentIdPattern,
  completedPracticeQuestionIdPattern,
  studentPracticeSchema
};
