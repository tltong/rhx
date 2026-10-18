const STUDENT_ESSAY_PRACTICES_COLLECTION = "studentEssayPractices";
const ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION = "assignedEssayPractices";
const COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION = "completedEssayPractices";

const studentEssayPracticeDocumentIdPattern = "[student_id]";
const assignedEssayPracticeDocumentIdPattern = "[essay_practice_id]";
const completedEssayPracticeDocumentIdPattern = "[essay_practice_id]";

const studentEssayPracticeSchema = {
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

module.exports = {
  STUDENT_ESSAY_PRACTICES_COLLECTION,
  ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION,
  COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION,
  studentEssayPracticeDocumentIdPattern,
  assignedEssayPracticeDocumentIdPattern,
  completedEssayPracticeDocumentIdPattern,
  studentEssayPracticeSchema
};

