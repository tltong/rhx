const PRACTICES_COLLECTION = "practices";

const practiceDocumentIdPattern = "[auto_generated_id]";
const practiceQuestionSyllabusIdPattern = "[syllabus_id]";
const practiceQuestionTopicIdPattern = "[topic_id]";
const practiceQuestionLanguagePattern = "[syllabus_language]";
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
          language: {
            type: "string",
            pattern: practiceQuestionLanguagePattern,
            requiredForPracticeTypes: [practiceTypes.ASSESSMENT],
          },
          hasDiagram: {
            type: "boolean",
            requiredForPracticeTypes: [practiceTypes.ASSESSMENT],
          },
          questionId: {
            type: "string",
            pattern: practiceQuestionIdPattern,
            references: {
              assessment:
                "questions/{syllabusId}/topics/{topicId}/languages/{languageId}/diagramGroups/{diagramGroup}/questionItems/{questionId}",
              preAssessment:
                "preAssessmentQuestions/{syllabusId}/topics/{topicId}/questionItems/{questionId}",
            },
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
  practiceQuestionLanguagePattern,
  practiceQuestionIdPattern,
  practiceTypes,
  practiceSchema
};
