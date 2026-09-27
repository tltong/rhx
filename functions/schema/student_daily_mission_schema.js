const STUDENT_DAILY_MISSIONS_COLLECTION = "studentDailyMissions";
const STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION = "days";
const STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION = "syllabuses";
const STUDENT_DAILY_MISSION_CORE_TOPICS_SUBCOLLECTION = "coreTopics";
const STUDENT_DAILY_MISSION_ADDITIONAL_TOPICS_SUBCOLLECTION = "additionalTopics";
const STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION = "practices";
const STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION = "pausedTopics";
const STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION = "missionStats";
const STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION = "topics";

const studentDailyMissionDocumentIdPattern = "[student_id]";
const studentDailyMissionDayDocumentIdPattern = "[yyyy-mm-dd]";
const studentDailyMissionSyllabusDocumentIdPattern = "[syllabus_id]";
const studentDailyMissionTopicDocumentIdPattern = "[topic_id]";
const studentDailyMissionPracticeDocumentIdPattern = "[practice_id]";

const studentDailyMissionSchema = {
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

module.exports = {
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
