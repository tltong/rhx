const REWARDS_COLLECTION = "rewards";
const REWARD_CONFIG_DOCUMENT_ID = "config";
const REWARD_ASSESSMENT_FRAMEWORKS_SUBCOLLECTION = "assessmentFrameworks";
const REWARD_CATEGORIES_SUBCOLLECTION = "categories";
const REWARD_HISTORY_SUBCOLLECTION = "history";
const DEFAULT_REWARD_HISTORY_LIMIT = 25;
const MAX_REWARD_HISTORY_LIMIT = 100;
const MAX_RECENT_REWARD_ACTIVITIES_LIMIT = 50;
const RewardCategory = Object.freeze({
  DAILY_LOGIN: "dailyLogin",
  DAILY_MISSION_COMPLETION: "dailyMissionCompletion",
  BONUS_MISSION_COMPLETION: "bonusMissionCompletion",
  ASSESSMENT_LEVEL: "assessmentLevel",
  LOGIN_STREAK: "loginStreak",
});
const LOGIN_STREAK_DAYS = Object.freeze(["3", "7", "14", "30"]);
const DEFAULT_REWARD_CONFIG = Object.freeze({
  dailyLoginCoins: 1,
  dailyMissionCompletionCoins: 25,
  bonusMissionCompletionCoins: 20,
  recentActivitiesLimit: 5,
  loginStreakCoins: Object.freeze({"3": 2, "7": 5, "14": 10, "30": 25}),
});
const coinValueSchema = {type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER};
const rewardConfigSchema = {
  collection: REWARDS_COLLECTION,
  documentId: REWARD_CONFIG_DOCUMENT_ID,
  fields: {
    dailyLoginCoins: {...coinValueSchema, default: DEFAULT_REWARD_CONFIG.dailyLoginCoins},
    dailyMissionCompletionCoins: {...coinValueSchema, default: DEFAULT_REWARD_CONFIG.dailyMissionCompletionCoins},
    bonusMissionCompletionCoins: {...coinValueSchema, default: DEFAULT_REWARD_CONFIG.bonusMissionCompletionCoins},
    recentActivitiesLimit: {
      type: "integer", minimum: 1, maximum: MAX_RECENT_REWARD_ACTIVITIES_LIMIT,
      default: DEFAULT_REWARD_CONFIG.recentActivitiesLimit,
    },
    loginStreakCoins: {
      type: "map",
      fields: Object.fromEntries(LOGIN_STREAK_DAYS.map((days) => [
        days, {...coinValueSchema, default: DEFAULT_REWARD_CONFIG.loginStreakCoins[days]},
      ])),
    },
    updatedAt: "timestamp",
    updatedBy: "string",
  },
  subcollections: {
    assessmentFrameworks: {
      collection: REWARD_ASSESSMENT_FRAMEWORKS_SUBCOLLECTION,
      documentId: "[assessment_framework_id]",
      fields: {
        levelCoins: {type: "map", keys: "[level_id]", values: coinValueSchema},
        updatedAt: "timestamp",
        updatedBy: "string",
      },
    },
  },
};

const studentRewardSchema = {
  collection: REWARDS_COLLECTION,
  documentId: "[student_id]",
  reservedDocumentIds: [REWARD_CONFIG_DOCUMENT_ID],
  fields: {
    totalCoins: {...coinValueSchema, default: 0},
    updatedAt: "timestamp",
  },
  subcollections: {
    categories: {
      collection: REWARD_CATEGORIES_SUBCOLLECTION,
      documentId: "[category_id]",
      documentIdEnum: Object.values(RewardCategory),
      fields: {
        totalCoins: {...coinValueSchema, default: 0},
        updatedAt: "timestamp",
      },
      subcollections: {
        history: {
          collection: REWARD_HISTORY_SUBCOLLECTION,
          documentId: "[award_id]",
          fields: {
            coins: coinValueSchema,
            earnedAt: "timestamp",
            sourceId: "string",
            details: {type: "map"},
          },
        },
      },
    },
  },
};

module.exports = {REWARDS_COLLECTION, REWARD_CONFIG_DOCUMENT_ID, REWARD_ASSESSMENT_FRAMEWORKS_SUBCOLLECTION, LOGIN_STREAK_DAYS, DEFAULT_REWARD_CONFIG, rewardConfigSchema, REWARD_CATEGORIES_SUBCOLLECTION, REWARD_HISTORY_SUBCOLLECTION, RewardCategory, DEFAULT_REWARD_HISTORY_LIMIT, MAX_REWARD_HISTORY_LIMIT, MAX_RECENT_REWARD_ACTIVITIES_LIMIT, studentRewardSchema};
