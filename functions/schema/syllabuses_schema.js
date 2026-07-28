const SYLLABUSES_COLLECTION = "syllabuses";
const SYLLABUS_TOPICS_SUBCOLLECTION = "topics";

const syllabusDocumentIdPattern = "[auto_generated_id]";
const syllabusTopicDocumentIdPattern = "[auto_generated_id]";
const syllabusSubtopicIdPattern = "[auto_generated_subtopic_id]";
const syllabusAssessmentFrameworkIdPattern = "[assessment_framework_id]";

const syllabusesSchema = {
  collection: SYLLABUSES_COLLECTION,
  documentId: syllabusDocumentIdPattern,
  fields: {
    country: "string",
    level: "string",
    year: "number",
    subject: "string",
    languages: {
      type: "array",
      items: "string"
    },
    active: {
      type: "boolean",
      default: false
    },
    assessmentFrameworkId: {
      type: "string",
      pattern: syllabusAssessmentFrameworkIdPattern,
      references: "assessmentFrameworks/{assessmentFrameworkId}"
    }
  },
  subcollections: {
    topics: {
      collection: SYLLABUS_TOPICS_SUBCOLLECTION,
      documentId: syllabusTopicDocumentIdPattern,
      fields: {
        topicName: "string",
        subtopics: {
          type: "map",
          entries: {
            [syllabusSubtopicIdPattern]: "string"
          }
        }
      }
    }
  }
};

module.exports = {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION,
  syllabusDocumentIdPattern,
  syllabusTopicDocumentIdPattern,
  syllabusSubtopicIdPattern,
  syllabusAssessmentFrameworkIdPattern,
  syllabusesSchema
};
