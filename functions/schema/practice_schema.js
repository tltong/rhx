const PRACTICES_COLLECTION = "practices";

const practiceDocumentIdPattern = "[auto_generated_id]";
const practiceQuestionSyllabusIdPattern = "[syllabus_id]";
const practiceQuestionTopicIdPattern = "[topic_id]";
const practiceQuestionIdPattern = "[question_id]";

const practiceTypes = Object.freeze({
  ASSESSMENT: "assessment",
  PRE_ASSESSMENT: "pre assessment"
});

const practiceSchema = {
  collection: PRACTICES_COLLECTION,
  documentId: practiceDocumentIdPattern,
  fields: {
    type: {
      type: "string",
      enum: Object.values(practiceTypes)
    },
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

module.exports = {
  PRACTICES_COLLECTION,
  practiceDocumentIdPattern,
  practiceQuestionSyllabusIdPattern,
  practiceQuestionTopicIdPattern,
  practiceQuestionIdPattern,
  practiceTypes,
  practiceSchema
};
