const SYLLABUSES_COLLECTION = "syllabuses";
const SYLLABUS_TOPICS_SUBCOLLECTION = "topics";

const preAssessmentPracticeTypes = Object.freeze({NORMAL: "normal", ESSAY: "essay", FILL_IN_THE_BLANKS: "fillInTheBlanks"});

const syllabusDocumentIdPattern = "[auto_generated_id]";
const syllabusTopicDocumentIdPattern = "[auto_generated_id]";
const syllabusSubtopicIdPattern = "[auto_generated_subtopic_id]";
const syllabusAssessmentFrameworkIdPattern = "[assessment_framework_id]";
const syllabusPreAssessmentLanguageKeyPattern =
  "[normalized_language]";
const syllabusPreAssessmentPracticeIdPattern = "[practice_id]";

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
    }
  },
  subcollections: {
    topics: {
      collection: SYLLABUS_TOPICS_SUBCOLLECTION,
      documentId: syllabusTopicDocumentIdPattern,
      fields: {
        topicName: "string",
        assessmentFrameworkIds: {type: "map", description: "Required per topic/language on active syllabuses; framework type determines question format.", entries: {[syllabusPreAssessmentLanguageKeyPattern]: {type: "string", references: "assessmentFrameworks/{assessmentFrameworkId}"}}},
        pausable: {
          type: "boolean",
          default: true
        },
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
                practiceType: {
                  type: "string",
                  enum: Object.values(preAssessmentPracticeTypes),
                  default: preAssessmentPracticeTypes.NORMAL
                },
                practiceId: {
                  type: "string",
                  pattern: syllabusPreAssessmentPracticeIdPattern,
                  referencesByPracticeType: {
                    normal: "practices/{practiceId}",
                    essay: "essayPractices/{practiceId}",
                    fillInTheBlanks: "fillInTheBlanksPractices/{practiceId}"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

module.exports = {
  SYLLABUSES_COLLECTION,
  SYLLABUS_TOPICS_SUBCOLLECTION,
  preAssessmentPracticeTypes,
  syllabusDocumentIdPattern,
  syllabusTopicDocumentIdPattern,
  syllabusSubtopicIdPattern,
  syllabusAssessmentFrameworkIdPattern,
  syllabusPreAssessmentLanguageKeyPattern,
  syllabusPreAssessmentPracticeIdPattern,
  syllabusesSchema
};
