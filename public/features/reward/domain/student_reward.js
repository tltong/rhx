import {RewardCategory, REWARD_CONFIG_DOCUMENT_ID, DEFAULT_REWARD_HISTORY_LIMIT, MAX_REWARD_HISTORY_LIMIT, MAX_RECENT_REWARD_ACTIVITIES_LIMIT} from "../../../config/firebase/reward_schema.js?v=20261013-recent-reward-activities-v1";
import {requireCoinValue} from "./reward_config.js?v=20261013-recent-reward-activities-v1";

const categoryIds = Object.freeze(Object.values(RewardCategory));
function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(name + " must be an object.");
  }
  return value;
}
function requireDocumentId(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")
      || [".", ".."].includes(value.trim()) || /^__.*__$/.test(value.trim())
      || new TextEncoder().encode(value.trim()).length > 1500) {
    throw new Error(name + " must be a valid document ID.");
  }
  return value.trim();
}
function requireStudentRewardScope(input) {
  requireRecord(input, "Student reward scope");
  const studentId = requireDocumentId(input.studentId, "studentId");
  if (studentId === REWARD_CONFIG_DOCUMENT_ID) {
    throw new Error("studentId must not use the reserved reward configuration document ID.");
  }
  return {studentId};
}
function requireStudentRewardCategoryScope(input) {
  const scope = requireStudentRewardScope(input);
  if (!categoryIds.includes(input.categoryId)) {
    throw new Error("categoryId must be a supported RewardCategory value.");
  }
  return {...scope, categoryId: input.categoryId};
}
function cloneDetails(value, ancestors = new Set(), parentIsArray = false) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || !value || ancestors.has(value)) {
    throw new Error("details must contain finite, serializable values without cycles.");
  }
  const isArray = Array.isArray(value);
  if (isArray && parentIsArray) throw new Error("details must not contain directly nested arrays.");
  if (!isArray) requireRecord(value, "details");
  ancestors.add(value);
  const result = isArray
    ? Array.from(value, (item) => cloneDetails(item, ancestors, true))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (!key || /^__.*__$/.test(key)) throw new Error("details contains an unsupported field name.");
      return [key, cloneDetails(item, ancestors)];
    }));
  ancestors.delete(value);
  return Object.freeze(result);
}
function requireRewardDetails(input) {
  requireRecord(input, "details");
  return cloneDetails(input);
}
function requireStudentRewardPracticeScope(input) {
  return {...requireStudentRewardScope(input), practiceId: requireDocumentId(input.practiceId, "practiceId")};
}
function requireStudentRewardAwardScope(input) {
  const scope = requireStudentRewardCategoryScope(input);
  return {...scope, awardId: requireDocumentId(input.awardId, "awardId")};
}
function requireStudentRewardInput(input) {
  const scope = requireStudentRewardAwardScope(input);
  if (typeof input.sourceId !== "string" || !input.sourceId.trim()) {
    throw new Error("sourceId must be a nonempty reference.");
  }
  return {
    ...scope, coins: requireCoinValue(input.coins, "coins"),
    sourceId: input.sourceId.trim(), details: requireRewardDetails(input.details),
  };
}
function requireStoredTotal(data) {
  return data === null ? 0 : requireCoinValue(data.totalCoins, "totalCoins");
}
function requireTimestamp(value) {
  const date = value instanceof Date ? value : value?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("earnedAt must be a valid timestamp.");
  }
  return new Date(date.getTime());
}
class StudentRewardHistoryEntry {
  constructor(input) {
    Object.assign(this, requireStudentRewardInput(input));
    this.earnedAt = requireTimestamp(input.earnedAt);
    Object.freeze(this);
  }
}
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}
function requireMatchingAward(existing, input) {
  if (existing.coins !== input.coins || existing.sourceId !== input.sourceId
      || JSON.stringify(canonicalValue(existing.details)) !== JSON.stringify(canonicalValue(input.details))) {
    const error = new Error("awardId has already been used with different reward data.");
    error.code = "already-exists";
    throw error;
  }
}
function requireStudentRewardHistoryInput(input) {
  const scope = requireStudentRewardCategoryScope(input);
  const limit = input.limit === undefined ? DEFAULT_REWARD_HISTORY_LIMIT : input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_REWARD_HISTORY_LIMIT) {
    throw new Error("limit must be a whole number from 1 to " + MAX_REWARD_HISTORY_LIMIT + ".");
  }
  let cursor = null;
  if (input.cursor !== undefined && input.cursor !== null) {
    const cursorScope = requireStudentRewardCategoryScope(input.cursor);
    if (cursorScope.studentId !== scope.studentId || cursorScope.categoryId !== scope.categoryId) {
      throw new Error("cursor must belong to the requested student and category.");
    }
    cursor = {...cursorScope, awardId: requireDocumentId(input.cursor.awardId, "cursor.awardId")};
  }
  return {...scope, limit, cursor};
}
function requireRecentStudentRewardActivitiesInput(input) {
  const scope = requireStudentRewardScope(input);
  if (!Number.isSafeInteger(input.limit) || input.limit < 1
      || input.limit > MAX_RECENT_REWARD_ACTIVITIES_LIMIT) {
    throw new Error("limit must be a whole number from 1 to " + MAX_RECENT_REWARD_ACTIVITIES_LIMIT + ".");
  }
  return {...scope, limit: input.limit};
}

export {StudentRewardHistoryEntry, requireStudentRewardScope, requireStudentRewardCategoryScope, requireStudentRewardAwardScope, requireStudentRewardPracticeScope, requireStudentRewardInput, requireStoredTotal, requireMatchingAward, requireStudentRewardHistoryInput, requireRecentStudentRewardActivitiesInput};
