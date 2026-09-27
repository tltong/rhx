export const STUDENT_DAILY_MISSIONS_COLLECTION = "studentDailyMissions";
export const STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION = "days";
export const STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION = "syllabuses";
export const STUDENT_DAILY_MISSION_CORE_TOPICS_SUBCOLLECTION = "coreTopics";
export const STUDENT_DAILY_MISSION_ADDITIONAL_TOPICS_SUBCOLLECTION = "additionalTopics";
export const STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION = "practices";
export const STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION = "pausedTopics";
export const STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION = "missionStats";
export const STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION = "topics";

export const studentDailyMissionDocumentIdPattern = "[student_id]";
export const studentDailyMissionDayDocumentIdPattern = "[yyyy-mm-dd]";
export const studentDailyMissionSyllabusDocumentIdPattern = "[syllabus_id]";
export const studentDailyMissionTopicDocumentIdPattern = "[topic_id]";
export const studentDailyMissionPracticeDocumentIdPattern = "[practice_id]";

export const studentDailyMissionSchema = {
  collection: STUDENT_DAILY_MISSIONS_COLLECTION,
  documentId: studentDailyMissionDocumentIdPattern,
  fields: {},
  subcollections: {
    days: {
      collection: STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION,
      documentId: studentDailyMissionDayDocumentIdPattern,
      fields: {},
      subcollections: {
        syllabuses: {
          collection: STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION,
          documentId: studentDailyMissionSyllabusDocumentIdPattern,
          fields: {
            coreMission: {
              type: "map",
              fields: {
                topicId: "string",
                practiceId: "string"
              }
            }
          },
          subcollections: {
            coreTopics: {
              collection: STUDENT_DAILY_MISSION_CORE_TOPICS_SUBCOLLECTION,
              documentId: studentDailyMissionTopicDocumentIdPattern,
              fields: {},
              subcollections: {
                practices: {
                  collection: STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION,
                  documentId: studentDailyMissionPracticeDocumentIdPattern,
                  fields: {}
                }
              }
            },
            additionalTopics: {
              collection: STUDENT_DAILY_MISSION_ADDITIONAL_TOPICS_SUBCOLLECTION,
              documentId: studentDailyMissionTopicDocumentIdPattern,
              fields: {},
              subcollections: {
                practices: {
                  collection: STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION,
                  documentId: studentDailyMissionPracticeDocumentIdPattern,
                  fields: {}
                }
              }
            }
          }
        }
      }
    },
    pausedTopics: {
      collection: STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION,
      documentId: studentDailyMissionSyllabusDocumentIdPattern,
      fields: {},
      subcollections: {
        topics: {
          collection: STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION,
          documentId: studentDailyMissionTopicDocumentIdPattern,
          fields: {
            pausedDate: "string"
          }
        }
      }
    },
    missionStats: {
      collection: STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION,
      documentId: studentDailyMissionSyllabusDocumentIdPattern,
      fields: {},
      subcollections: {
        topics: {
          collection: STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION,
          documentId: studentDailyMissionTopicDocumentIdPattern,
          fields: {
            lastAcceptedDate: "string"
          }
        }
      }
    }
  }
};

export default {
  STUDENT_DAILY_MISSIONS_COLLECTION,
  STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_CORE_TOPICS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_ADDITIONAL_TOPICS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION,
  studentDailyMissionDocumentIdPattern,
  studentDailyMissionDayDocumentIdPattern,
  studentDailyMissionSyllabusDocumentIdPattern,
  studentDailyMissionTopicDocumentIdPattern,
  studentDailyMissionPracticeDocumentIdPattern,
  studentDailyMissionSchema
};
