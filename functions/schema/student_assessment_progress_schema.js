const STUDENT_ASSESSMENT_PROGRESS_COLLECTION = "studentAssessmentProgress";
const STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION = "syllabuses";
const STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION = "topics";

const studentAssessmentProgressDocumentIdPattern = "[student_id]";
const studentAssessmentSyllabusDocumentIdPattern = "[syllabus_id]";
const studentAssessmentTopicDocumentIdPattern = "[topic_id]";
const studentAssessmentLevelIdPattern = "[level_id]";

const studentAssessmentProgressSchema = {
  collection: STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
  documentId: studentAssessmentProgressDocumentIdPattern,
  fields: {},
  subcollections: {
    syllabuses: {
      collection: STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION,
      documentId: studentAssessmentSyllabusDocumentIdPattern,
      fields: {},
      subcollections: {
        topics: {
          collection: STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION,
          documentId: studentAssessmentTopicDocumentIdPattern,
          fields: {
            initialLevel: {
              type: "map",
              fields: {
                levelId: "string",
                setAt: "timestamp"
              }
            },
            currentLevelId: "string",
            isFrameworkCompleted: "boolean",
            levelHistory: {
              type: "map",
              entries: {
                [studentAssessmentLevelIdPattern]: "timestamp"
              }
            }
          }
        }
      }
    }
  }
};

module.exports = {
  STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
  STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION,
  STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION,
  studentAssessmentProgressDocumentIdPattern,
  studentAssessmentSyllabusDocumentIdPattern,
  studentAssessmentTopicDocumentIdPattern,
  studentAssessmentLevelIdPattern,
  studentAssessmentProgressSchema
};
