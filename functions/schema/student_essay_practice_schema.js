const STUDENT_ESSAY_PRACTICES_COLLECTION = "studentEssayPractices";
const ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION = "assignedEssayPractices";
const COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION = "completedEssayPractices";
const ESSAY_QUESTION_USAGE_SUBCOLLECTION = "questionUsage";

const studentEssayPracticeDocumentIdPattern = "[student_id]";
const assignedEssayPracticeDocumentIdPattern = "[essay_practice_id]";
const completedEssayPracticeDocumentIdPattern = "[essay_practice_id]";

const studentEssayPracticeSchema = {
  collection: STUDENT_ESSAY_PRACTICES_COLLECTION,
  documentId: studentEssayPracticeDocumentIdPattern,
  fields: {},
  subcollections: {
    questionUsage: {
      collection: ESSAY_QUESTION_USAGE_SUBCOLLECTION,
      documentId: "[essay_question_id]",
      fields: {essayPracticeId: "string", syllabusId: "string", topicId: "string", assignedAt: "timestamp"}
    },
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
        timeTakenSeconds: "number",
        scoring: {type: "map", fields: {status: "pending|scoring|completed|failed|superseded", updatedAt: "timestamp", leaseUntil: {type: "timestamp", optional: true}}}
      }
    }
  }
};

module.exports = {
  STUDENT_ESSAY_PRACTICES_COLLECTION,
  ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION,
  COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION,
  ESSAY_QUESTION_USAGE_SUBCOLLECTION,
  studentEssayPracticeDocumentIdPattern,
  assignedEssayPracticeDocumentIdPattern,
  completedEssayPracticeDocumentIdPattern,
  studentEssayPracticeSchema
};

