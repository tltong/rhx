const {LOGIN_STREAK_DAYS, DEFAULT_REWARD_CONFIG, MAX_RECENT_REWARD_ACTIVITIES_LIMIT} = require("../../../schema/reward_schema");

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(name + " must be an object.");
  }
  return value;
}
function requireCoinValue(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(name + " must be a nonnegative whole number within the safe integer range.");
  }
  return value;
}
function requireRecentActivitiesLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RECENT_REWARD_ACTIVITIES_LIMIT) {
    throw new Error("recentActivitiesLimit must be a whole number from 1 to " + MAX_RECENT_REWARD_ACTIVITIES_LIMIT + ".");
  }
  return value;
}
function requireConfigurationInput(input) {
  requireRecord(input, "Reward configuration");
  const streaks = requireRecord(input.loginStreakCoins, "loginStreakCoins");
  if (Object.keys(streaks).some((key) => !LOGIN_STREAK_DAYS.includes(key))) {
    throw new Error("loginStreakCoins supports only 3, 7, 14 and 30 days.");
  }
  return {
    dailyLoginCoins: requireCoinValue(input.dailyLoginCoins, "dailyLoginCoins"),
    dailyMissionCompletionCoins: requireCoinValue(input.dailyMissionCompletionCoins, "dailyMissionCompletionCoins"),
    bonusMissionCompletionCoins: requireCoinValue(input.bonusMissionCompletionCoins, "bonusMissionCompletionCoins"),
    recentActivitiesLimit: requireRecentActivitiesLimit(input.recentActivitiesLimit === undefined
      ? DEFAULT_REWARD_CONFIG.recentActivitiesLimit : input.recentActivitiesLimit),
    loginStreakCoins: Object.fromEntries(LOGIN_STREAK_DAYS.map((key) => [
      key, requireCoinValue(streaks[key], "loginStreakCoins." + key),
    ])),
  };
}
function requireIdentifier(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")
      || [".", ".."].includes(value.trim())) {
    throw new Error(name + " must be a nonempty document ID without '/'.");
  }
  return value.trim();
}
function requireFrameworkScope(input) {
  requireRecord(input, "Assessment framework reward scope");
  return {assessmentFrameworkId: requireIdentifier(input.assessmentFrameworkId, "assessmentFrameworkId")};
}
function requireLevelCoins(input) {
  requireRecord(input, "levelCoins");
  return Object.fromEntries(Object.entries(input).map(([key, coins]) => {
    if (requireIdentifier(key, "levelId") !== key) {
      throw new Error("levelId must not contain surrounding whitespace.");
    }
    return [key, requireCoinValue(coins, "levelCoins." + key)];
  }));
}
function requireFrameworkConfigurationInput(input) {
  return {...requireFrameworkScope(input), levelCoins: requireLevelCoins(input.levelCoins)};
}
function requireCurrentFrameworkLevels(levelCoins, framework, endLevelId) {
  if (!framework) {
    const error = new Error("Assessment framework was not found.");
    error.code = "not-found";
    throw error;
  }
  const levelIds = new Set((framework.levels || []).map((level) => level.id));
  for (const levelId of levelIds) {
    if (!Object.hasOwn(levelCoins, levelId)) {
      throw new Error("A coin value is required for assessment level '" + levelId + "'. Reload the framework levels and try again.");
    }
  }
  for (const levelId of Object.keys(levelCoins)) {
    if (!levelIds.has(levelId) && levelId !== endLevelId) {
      throw new Error("Assessment level '" + levelId + "' is not in this framework. Reload the framework levels and try again.");
    }
  }
}
function requireAdministratorUid(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("updatedBy must be an administrator UID.");
  }
  return value.trim();
}
function requireTimestamp(value) {
  const date = value instanceof Date ? value : value?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("updatedAt must be a valid timestamp.");
  }
  return new Date(date.getTime());
}
class RewardConfig {
  constructor(input) {
    Object.assign(this, requireConfigurationInput(input));
    this.loginStreakCoins = Object.freeze(this.loginStreakCoins);
    this.updatedAt = requireTimestamp(input.updatedAt);
    this.updatedBy = requireAdministratorUid(input.updatedBy);
    Object.freeze(this);
  }
}
class AssessmentFrameworkRewardConfig {
  constructor(input) {
    Object.assign(this, requireFrameworkConfigurationInput(input));
    this.levelCoins = Object.freeze(this.levelCoins);
    this.updatedAt = requireTimestamp(input.updatedAt);
    this.updatedBy = requireAdministratorUid(input.updatedBy);
    Object.freeze(this);
  }
}

module.exports = {RewardConfig, AssessmentFrameworkRewardConfig, requireCoinValue, requireRecentActivitiesLimit, requireConfigurationInput, requireFrameworkScope, requireFrameworkConfigurationInput, requireCurrentFrameworkLevels, requireAdministratorUid};
