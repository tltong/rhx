export const STUDENT_DAILY_MISSIONS_COLLECTION = "studentDailyMissions";
export const STUDENT_DAILY_MISSION_DAYS_SUBCOLLECTION = "days";
export const STUDENT_DAILY_MISSION_SYLLABUSES_SUBCOLLECTION = "syllabuses";
export const STUDENT_DAILY_MISSION_CORE_TOPICS_SUBCOLLECTION = "coreTopics";
export const STUDENT_DAILY_MISSION_ADDITIONAL_TOPICS_SUBCOLLECTION = "additionalTopics";
export const STUDENT_DAILY_MISSION_PRACTICES_SUBCOLLECTION = "practices";
export const STUDENT_DAILY_MISSION_PAUSED_TOPICS_SUBCOLLECTION = "pausedTopics";
export const STUDENT_DAILY_MISSION_STATS_SUBCOLLECTION = "missionStats";
export const STUDENT_DAILY_MISSION_TOPICS_SUBCOLLECTION = "topics";
export const STUDENT_DAILY_MISSION_ACCEPTED_PRACTICES_SUBCOLLECTION = "acceptedDailyMissionPractices";
export const STUDENT_DAILY_MISSION_ACCEPTED_ADDITIONAL_PRACTICES_SUBCOLLECTION = "acceptedAdditionalMissionPractices";

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
    acceptedAdditionalMissionEssays: {
      collection: "acceptedAdditionalMissionEssays", documentId: "[student_essay_practice_id]",
      fields: {missionDate: "string", syllabusId: "string", topicId: "string", practiceType: "essay"},
    },
    acceptedDailyMissionEssays: {
      collection: "acceptedDailyMissionEssays",
      documentId: "[student_essay_practice_id]",
      fields: {missionDate: "string", syllabusId: "string", topicId: "string", practiceType: "essay"},
    },
    acceptedDailyMissionPractices: {
      collection: STUDENT_DAILY_MISSION_ACCEPTED_PRACTICES_SUBCOLLECTION,
      documentId: studentDailyMissionPracticeDocumentIdPattern,
      fields: {
        missionDate: {type: "string", format: "YYYY-MM-DD"},
        syllabusId: "string",
        topicId: "string",
      },
    },
    acceptedAdditionalMissionPractices: {
      collection: STUDENT_DAILY_MISSION_ACCEPTED_ADDITIONAL_PRACTICES_SUBCOLLECTION,
      documentId: studentDailyMissionPracticeDocumentIdPattern,
      fields: {
        missionDate: {type: "string", format: "YYYY-MM-DD"},
        syllabusId: "string",
        topicId: "string",
      },
    },
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
                practiceId: "string",
                practiceType: {type: "enum", values: ["normal", "essay"], default: "normal"}
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
                essays: {collection: "essays", documentId: "[student_essay_practice_id]", fields: {practiceType: "essay"}},
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
  STUDENT_DAILY_MISSION_ACCEPTED_ADDITIONAL_PRACTICES_SUBCOLLECTION,
  STUDENT_DAILY_MISSION_ACCEPTED_PRACTICES_SUBCOLLECTION,
  studentDailyMissionDocumentIdPattern,
  studentDailyMissionDayDocumentIdPattern,
  studentDailyMissionSyllabusDocumentIdPattern,
  studentDailyMissionTopicDocumentIdPattern,
  studentDailyMissionPracticeDocumentIdPattern,
  studentDailyMissionSchema
};
