const STUDENT_ESSAY_PRACTICE_GENERATIONS_COLLECTION = "studentEssayPracticeGenerations";
const ESSAY_FOLLOW_UP_GENERATIONS_SUBCOLLECTION = "completions";

const studentEssayPracticeGeneratorSchema = {
  collection: STUDENT_ESSAY_PRACTICE_GENERATIONS_COLLECTION,
  documentId: "[studentId]",
  fields: {},
  subcollections: {
    completions: {
      collection: ESSAY_FOLLOW_UP_GENERATIONS_SUBCOLLECTION,
      documentId: "[completedEssayPracticeId]",
      fields: {
        status: "generating|completed|failed",
        nextEssayPracticeId: "string",
        essayQuestionId: {type: "string", optional: true},
        reusedQuestionId: {type: "string", optional: true},
        // A temporary draft makes question persistence and assignment retryable.
        draft: {type: "map", optional: true, fields: {
          questionId: "string", level: "primary|secondary", standard: "number",
          language: "string", difficulty: "medium", questionText: "string", seedUsed: "string",
          wordCountRequirement: {type: "map", fields: {minWords: "number|null"}},
        }},
        leaseToken: {type: "string", optional: true},
        leaseUntil: {type: "timestamp", optional: true},
        updatedAt: "timestamp",
      },
    },
  },
};

module.exports = {STUDENT_ESSAY_PRACTICE_GENERATIONS_COLLECTION,
  ESSAY_FOLLOW_UP_GENERATIONS_SUBCOLLECTION, studentEssayPracticeGeneratorSchema};
