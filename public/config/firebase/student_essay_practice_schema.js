export const STUDENT_ESSAY_PRACTICES_COLLECTION = "studentEssayPractices";
export const ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION = "assignedEssayPractices";
export const COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION = "completedEssayPractices";

export const studentEssayPracticeDocumentIdPattern = "[student_id]";
export const assignedEssayPracticeDocumentIdPattern = "[essay_practice_id]";
export const completedEssayPracticeDocumentIdPattern = "[essay_practice_id]";

export const studentEssayPracticeSchema = {
  collection: STUDENT_ESSAY_PRACTICES_COLLECTION,
  documentId: studentEssayPracticeDocumentIdPattern,
  fields: {},
  subcollections: {
    assignedEssayPractices: {
      collection: ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION,
      documentId: assignedEssayPracticeDocumentIdPattern,
      fields: {
        essayQuestionId: "string",
        syllabusId: "string",
        topicId: "string",
        assignedAt: "timestamp"
      }
    },
    completedEssayPractices: {
      collection: COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION,
      documentId: completedEssayPracticeDocumentIdPattern,
      fields: {
        essayQuestionId: "string",
        syllabusId: "string",
        topicId: "string",
        assignedAt: "timestamp",
        completedAt: "timestamp",
        essayText: "string",
        timeTakenSeconds: "number"
      }
    }
  }
};

export default {
  STUDENT_ESSAY_PRACTICES_COLLECTION,
  ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION,
  COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION,
  studentEssayPracticeDocumentIdPattern,
  assignedEssayPracticeDocumentIdPattern,
  completedEssayPracticeDocumentIdPattern,
  studentEssayPracticeSchema
};

