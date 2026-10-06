export const STUDENT_PRACTICES_COLLECTION = "studentPractices";
export const ASSIGNED_PRACTICES_SUBCOLLECTION = "assignedPractices";
export const COMPLETED_PRACTICES_SUBCOLLECTION = "completedPractices";
export const COMPLETION_PROCESSING_SUBCOLLECTION = "completionProcessing";

export const studentPracticeDocumentIdPattern = "[student_id]";
export const assignedPracticeDocumentIdPattern = "[practice_id]";
export const completedPracticeDocumentIdPattern = "[practice_id]";
export const completionProcessingDocumentIdPattern = "[practice_id]";
export const completedPracticeQuestionIdPattern = "[question_id]";
const nullableString = Object.freeze({
  type: "string",
  nullable: true
});
const nullableTimestamp = Object.freeze({
  type: "timestamp",
  nullable: true
});

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
    },
    completionProcessing: {
      collection: COMPLETION_PROCESSING_SUBCOLLECTION,
      documentId: completionProcessingDocumentIdPattern,
      fields: {
        status: "string",
        stage: "string",
        eventId: "string",
        startedAt: "timestamp",
        updatedAt: "timestamp",
        completedAt: nullableTimestamp,
        generatedPracticeId: nullableString,
        outcome: nullableString,
        errorCode: nullableString
      }
    }
  }
};

export default {
  STUDENT_PRACTICES_COLLECTION,
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  COMPLETED_PRACTICES_SUBCOLLECTION,
  COMPLETION_PROCESSING_SUBCOLLECTION,
  studentPracticeDocumentIdPattern,
  assignedPracticeDocumentIdPattern,
  completedPracticeDocumentIdPattern,
  completionProcessingDocumentIdPattern,
  completedPracticeQuestionIdPattern,
  studentPracticeSchema
};
