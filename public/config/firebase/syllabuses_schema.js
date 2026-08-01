export const SYLLABUSES_COLLECTION = "syllabuses";
export const SYLLABUS_TOPICS_SUBCOLLECTION = "topics";

export const syllabusDocumentIdPattern = "[auto_generated_id]";
export const syllabusTopicDocumentIdPattern = "[auto_generated_id]";
export const syllabusSubtopicIdPattern = "[auto_generated_subtopic_id]";
export const syllabusAssessmentFrameworkIdPattern = "[assessment_framework_id]";
export const syllabusPreAssessmentLanguageKeyPattern =
  "[normalized_language]";
export const syllabusPreAssessmentPracticeIdPattern = "[practice_id]";

export const syllabusesSchema = {
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
        },
        preAssessmentPractices: {
          type: "map",
          entries: {
            [syllabusPreAssessmentLanguageKeyPattern]: {
              type: "map",
              fields: {
                language: "string",
                practiceId: {
                  type: "string",
                  pattern: syllabusPreAssessmentPracticeIdPattern,
                  references: "practices/{practiceId}"
                }
              }
            }
          }
        }
      }
    }
  }
};

export default {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION,
  syllabusDocumentIdPattern,
  syllabusTopicDocumentIdPattern,
  syllabusSubtopicIdPattern,
  syllabusAssessmentFrameworkIdPattern,
  syllabusPreAssessmentLanguageKeyPattern,
  syllabusPreAssessmentPracticeIdPattern,
  syllabusesSchema
};
