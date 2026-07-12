export const PRACTICES_COLLECTION = "practices";

export const practiceDocumentIdPattern = "[auto_generated_id]";
export const practiceQuestionSyllabusIdPattern = "[syllabus_id]";
export const practiceQuestionTopicIdPattern = "[topic_id]";
export const practiceQuestionIdPattern = "[question_id]";

export const practiceSchema = {
  collection: PRACTICES_COLLECTION,
  documentId: practiceDocumentIdPattern,
  fields: {
    country: "string",
    level: "string",
    year: "number",
    subject: "string",
    difficulty: "string",
    language: "string",
    dateGenerated: "timestamp",
    questions: {
      type: "array",
      items: {
        type: "map",
        fields: {
          syllabusId: {
            type: "string",
            pattern: practiceQuestionSyllabusIdPattern
          },
          topicId: {
            type: "string",
            pattern: practiceQuestionTopicIdPattern
          },
          questionId: {
            type: "string",
            pattern: practiceQuestionIdPattern,
            references: "questions/{syllabusId}/topics/{topicId}/questionItems/{questionId}"
          }
        }
      }
    }
  }
};

export default {
  PRACTICES_COLLECTION,
  practiceDocumentIdPattern,
  practiceQuestionSyllabusIdPattern,
  practiceQuestionTopicIdPattern,
  practiceQuestionIdPattern,
  practiceSchema
};
