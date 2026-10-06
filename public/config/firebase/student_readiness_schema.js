
const STUDENT_READINESS_COLLECTION = "studentReadiness";
const READINESS_SYLLABUSES_SUBCOLLECTION = "syllabuses";
const READINESS_TOPICS_SUBCOLLECTION = "topics";
const READINESS_HISTORY_SUBCOLLECTION = "history";

const studentReadinessSchema = {
  collection: STUDENT_READINESS_COLLECTION,
  documentId: "[student_id]",
  fields: {},
  subcollections: {
    syllabuses: {
      collection: READINESS_SYLLABUSES_SUBCOLLECTION,
      documentId: "[syllabus_id]",
      fields: {},
      subcollections: {
        topics: {
          collection: READINESS_TOPICS_SUBCOLLECTION,
          documentId: "[topic_id]",
          fields: {
            score: {type: "number", minimum: 0},
            updatedAt: "timestamp",
          },
          subcollections: {
            history: {
              collection: READINESS_HISTORY_SUBCOLLECTION,
              documentId: "[auto_generated_id_or_practice_key]",
              fields: {
                score: {type: "number", minimum: 0},
                savedAt: "timestamp",
                practiceId: {
                  type: "string",
                  optional: true,
                  references: "practices/{practiceId}",
                },
              },
            },
          },
        },
      },
    },
  },
};

export {STUDENT_READINESS_COLLECTION, READINESS_SYLLABUSES_SUBCOLLECTION, READINESS_TOPICS_SUBCOLLECTION, READINESS_HISTORY_SUBCOLLECTION, studentReadinessSchema};
