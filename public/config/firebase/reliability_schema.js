const RELIABILITY_COLLECTION = "reliability";
const RELIABILITY_CONFIG_DOCUMENT_ID = "config";
const RELIABILITY_SYLLABUSES_SUBCOLLECTION = "syllabuses";
const RELIABILITY_TOPICS_SUBCOLLECTION = "topics";
const DEFAULT_PERCENTAGE_PER_PRACTICE = 10;

const reliabilityConfigSchema = {
  collection: RELIABILITY_COLLECTION,
  documentId: RELIABILITY_CONFIG_DOCUMENT_ID,
  fields: {
    percentagePerPractice: {
      type: "number", exclusiveMinimum: 0, maximum: 100,
      default: DEFAULT_PERCENTAGE_PER_PRACTICE,
    },
    updatedAt: "timestamp",
    updatedBy: "string",
  },
};

const studentReliabilitySchema = {
  collection: RELIABILITY_COLLECTION,
  documentId: "[student_id]",
  fields: {},
  subcollections: {
    syllabuses: {
      collection: RELIABILITY_SYLLABUSES_SUBCOLLECTION,
      documentId: "[syllabus_id]",
      fields: {
        score: {type: "number", minimum: 0, maximum: 100},
        updatedAt: "timestamp",
      },
      subcollections: {
        topics: {
          collection: RELIABILITY_TOPICS_SUBCOLLECTION,
          documentId: "[topic_id]",
          fields: {
            completedPracticeCount: {type: "integer", minimum: 0},
            score: {type: "number", minimum: 0, maximum: 100},
            updatedAt: "timestamp",
          },
        },
      },
    },
  },
};

export {
  RELIABILITY_COLLECTION, RELIABILITY_CONFIG_DOCUMENT_ID,
  RELIABILITY_SYLLABUSES_SUBCOLLECTION, RELIABILITY_TOPICS_SUBCOLLECTION,
  DEFAULT_PERCENTAGE_PER_PRACTICE, reliabilityConfigSchema, studentReliabilitySchema,
};
