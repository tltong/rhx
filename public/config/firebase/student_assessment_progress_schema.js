export const STUDENT_ASSESSMENT_PROGRESS_COLLECTION = "studentAssessmentProgress";
export const STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION = "syllabuses";
export const STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION = "topics";

export const studentAssessmentProgressDocumentIdPattern = "[student_id]";
export const studentAssessmentSyllabusDocumentIdPattern = "[syllabus_id]";
export const studentAssessmentTopicDocumentIdPattern = "[topic_id]";
export const studentAssessmentLevelIdPattern = "[level_id]";

export const studentAssessmentProgressSchema = {
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

export default {
  STUDENT_ASSESSMENT_PROGRESS_COLLECTION,
  STUDENT_ASSESSMENT_SYLLABUSES_SUBCOLLECTION,
  STUDENT_ASSESSMENT_TOPICS_SUBCOLLECTION,
  studentAssessmentProgressDocumentIdPattern,
  studentAssessmentSyllabusDocumentIdPattern,
  studentAssessmentTopicDocumentIdPattern,
  studentAssessmentLevelIdPattern,
  studentAssessmentProgressSchema
};
