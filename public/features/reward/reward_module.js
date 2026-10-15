/**
 * Feature APIs; none are Firebase callable endpoints.
 * awardAssessmentLevelUp({studentId, practiceId})
 *   -> Promise<{awards, coinsAwarded, totalCoins, categoryTotalCoins, alreadyAwarded}|null>
 * Reads the saved assessment transition and completion, then awards every newly
 * reached level using framework levelCoins. The first level is the initial baseline.
 * Each student/syllabus/topic/framework/level is awarded once. Jumps commit all
 * eligible rewards together; retries retain the first amounts. Returns null when
 * no saved level-up exists. Missing regular-level configuration fails; endLevel
 * has an optional allocation, default 0. Web writes require a site administrator.
 *
 * awardStudentLogin({studentId, loginDate})
 *   -> Promise<{dailyReward, streakReward}>
 * Site-admin write. Reads the saved login and its original streak snapshot, then
 * awards configured daily coins (unsaved default 1) and the 3/7/14/30-day bonus.
 * Missing login records fail with "not-found" unless a committed award plan exists.
 * Retries retain that plan, including after login history has been pruned.
 * awardAdditionalMissionCompletion({studentId, practiceId})
 *   -> Promise<{award, totalCoins, categoryTotalCoins, alreadyAwarded}|null>
 * Verifies accepted Additional Mission and saved completion, then awards
 * bonusMissionCompletionCoins (unsaved default 20), once per student/subject/topic/day.
 * Returns null when no accepted Additional Mission exists; incomplete missions
 * fail with "failed-precondition". Retries retain the original coin amount.
 *
 * awardDailyMissionCompletion({studentId, practiceId})
 *   -> Promise<{award, totalCoins, categoryTotalCoins, alreadyAwarded}|null>
 * Site-admin write. Verifies accepted Daily Mission and saved completion, then
 * awards dailyMissionCompletionCoins (unsaved default 25).
 * Returns null when no accepted Daily Mission exists; an accepted but incomplete
 * practice fails with "failed-precondition". Retries retain the original coins.
 * saveStudentReward({studentId, categoryId, awardId, coins, sourceId, details})
 *   -> Promise<{award: StudentRewardHistoryEntry, totalCoins, categoryTotalCoins, alreadyAwarded}>
 * getStudentRewardTotal({studentId}) -> Promise<number>
 * watchStudentRewardTotal({studentId, onChange, onError}) -> unsubscribe function
 * Signed-in read. Emits the current total (0 when missing) and subsequent changes.
 * onChange receives a number; onError receives read/validation errors.
 * getStudentRewardCategoryTotal({studentId, categoryId}) -> Promise<number>
 * listStudentRewardHistory({studentId, categoryId, limit?, cursor?})
 *   -> Promise<{entries: StudentRewardHistoryEntry[], nextCursor: object|null}>
 * listRecentStudentRewardActivities({studentId, limit})
 *   -> Promise<StudentRewardHistoryEntry[]>
 * Signed-in read. Returns the newest positive-coin entries across every reward
 * category. The required limit is configured by the caller from recentActivitiesLimit.
 * Missing totals return 0. History is newest first; default limit 25, maximum 100.
 * Pass nextCursor unchanged; cursors belong to one student and category.
 * Award IDs are unique within a student/category. Identical retries do not award again;
 * a reused ID with different coins, sourceId or details fails with "already-exists".
 * StudentRewardHistoryEntry: {studentId, categoryId, awardId, coins,
 *   earnedAt: Date, sourceId, details}. All timestamps are assigned by Firestore.
 * RewardCategory defines the five earning categories. Reads do not create records.
 * getRewardConfig() -> Promise<RewardConfig|null>
 * saveRewardConfig({dailyLoginCoins, dailyMissionCompletionCoins,
 *   bonusMissionCompletionCoins, loginStreakCoins, recentActivitiesLimit})
 *   -> Promise<RewardConfig>
 * getAssessmentFrameworkRewardConfig({assessmentFrameworkId})
 *   -> Promise<AssessmentFrameworkRewardConfig|null>
 * saveAssessmentFrameworkRewardConfig({assessmentFrameworkId, levelCoins})
 *   -> Promise<AssessmentFrameworkRewardConfig>
 * Coins must be nonnegative safe integers. Login streak keys: "3", "7", "14", "30".
 * levelCoins is keyed by current assessment level IDs; all regular levels are required.
 * The "endLevel" allocation is optional. Removed/unknown level IDs are rejected on save.
 * Configuration reads return null when unsaved and never persist defaults.
 * Saved configuration models include updatedAt: Date and updatedBy: administrator UID.
 * Framework models additionally include assessmentFrameworkId.
 */

/** Reads require sign-in; writes require a site administrator. */
import {DEFAULT_REWARD_CONFIG, RewardCategory} from "../../config/firebase/reward_schema.js?v=20261013-recent-reward-activities-v1";
import {FirestoreStudentRewardRepository} from "./infrastructure/firestore_student_reward_repository.js?v=20261013-recent-reward-activities-v1";
import {AwardAdditionalMissionCompletion} from "./application/award_additional_mission_completion.js?v=20261010-additional-mission-rewards-v1";
import {AwardDailyMissionCompletion} from "./application/award_daily_mission_completion.js?v=20261010-daily-mission-rewards-v1";
import {AwardAssessmentLevelUp} from "./application/award_assessment_level_up.js?v=20261010-level-rewards-v1";
import {getStudentPracticeAssessment} from "../student_assessment_progress/student_assessment_progress_module.js?v=20261010-level-rewards-v1";
import {AwardStudentLogin} from "./application/award_student_login.js?v=20261010-login-reward-api-v1";
import {getStudentLoginRecord, listStudentLoginHistory} from "../student_login/student_login_module.js?v=20261010-login-reward-api-v1";
import {getAcceptedAdditionalMissionForPractice, getAcceptedDailyMissionForPractice} from "../daily_mission/daily_mission_module.js?v=20261010-additional-mission-rewards-v1";
import {listCompletedPracticeIds} from "../student_practice/student_practice_module.js?v=20261003-completion-processing-v1";
import {SaveStudentReward} from "./application/save_student_reward.js?v=20261013-recent-reward-activities-v1";
import {GetStudentRewardTotal} from "./application/get_student_reward_total.js?v=20261013-recent-reward-activities-v1";
import {WatchStudentRewardTotal} from "./application/watch_student_reward_total.js?v=20261013-recent-reward-activities-v1";
import {GetStudentRewardCategoryTotal} from "./application/get_student_reward_category_total.js?v=20261013-recent-reward-activities-v1";
import {ListStudentRewardHistory} from "./application/list_student_reward_history.js?v=20261013-recent-reward-activities-v1";
import {ListRecentStudentRewardActivities} from "./application/list_recent_student_reward_activities.js?v=20261013-recent-reward-activities-v1";
import {FirestoreRewardConfigRepository} from "./infrastructure/firestore_reward_config_repository.js?v=20261013-recent-reward-activities-v1";
import {getAssessmentFrameworkById, ASSESSMENT_FRAMEWORK_END_LEVEL_ID} from "../assessment_framework/assessment_framework_module.js?v=20260823-student-dashboard-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {GetRewardConfig} from "./application/get_reward_config.js?v=20261013-recent-reward-activities-v1";
import {GetAssessmentFrameworkRewardConfig} from "./application/get_assessment_framework_reward_config.js?v=20261013-recent-reward-activities-v1";
import {SaveRewardConfig} from "./application/save_reward_config.js?v=20261013-recent-reward-activities-v1";
import {SaveAssessmentFrameworkRewardConfig} from "./application/save_assessment_framework_reward_config.js?v=20261013-recent-reward-activities-v1";

const repository = new FirestoreRewardConfigRepository();
const studentRepository = new FirestoreStudentRewardRepository();
const saveStudent = new SaveStudentReward(studentRepository, requireRewardAdministrator);
const getStudentTotal = new GetStudentRewardTotal(studentRepository);
const watchStudentTotal = new WatchStudentRewardTotal(studentRepository);
const getCategoryTotal = new GetStudentRewardCategoryTotal(studentRepository);
const listHistory = new ListStudentRewardHistory(studentRepository);
const listRecentActivities = new ListRecentStudentRewardActivities(studentRepository);
const getConfig = new GetRewardConfig(repository);
const awardLevelUp = new AwardAssessmentLevelUp({
  studentRewardRepository: studentRepository, getStudentPracticeAssessment, listCompletedPracticeIds,
  getAssessmentFrameworkRewardConfig, authorizeWrite: requireRewardAdministrator,
});
const awardLogin = new AwardStudentLogin({
  studentRewardRepository: studentRepository, getStudentLoginRecord,
  listStudentLoginHistory, getRewardConfig, authorizeWrite: requireRewardAdministrator,
});
const awardAdditionalMission = new AwardAdditionalMissionCompletion({
  studentRewardRepository: studentRepository, getAcceptedAdditionalMissionForPractice,
  listCompletedPracticeIds, getRewardConfig, authorizeWrite: requireRewardAdministrator,
});
const awardDailyMission = new AwardDailyMissionCompletion({
  studentRewardRepository: studentRepository, getAcceptedDailyMissionForPractice,
  listCompletedPracticeIds, getRewardConfig, authorizeWrite: requireRewardAdministrator,
});
const saveConfig = new SaveRewardConfig(repository, requireRewardAdministrator);
const getFrameworkConfig = new GetAssessmentFrameworkRewardConfig(repository);
const saveFrameworkConfig = new SaveAssessmentFrameworkRewardConfig(repository, {
  requireAdministrator: requireRewardAdministrator, getAssessmentFrameworkById,
  endLevelId: ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
});

async function requireRewardAdministrator() {
  const user = requireCurrentFirebaseAuthUser();
  const status = await requireCurrentSiteAdmin();
  const currentUser = requireCurrentFirebaseAuthUser();
  if (currentUser.uid !== user.uid || currentUser.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in account changed. Try saving again.");
  }
  return currentUser;
}
async function getRewardConfig() {
  requireCurrentFirebaseAuthUser();
  return getConfig.execute();
}
async function saveRewardConfig(input) {
  requireCurrentFirebaseAuthUser();
  return saveConfig.execute(input);
}
async function getAssessmentFrameworkRewardConfig(input) {
  requireCurrentFirebaseAuthUser();
  return getFrameworkConfig.execute(input);
}
async function saveAssessmentFrameworkRewardConfig(input) {
  requireCurrentFirebaseAuthUser();
  return saveFrameworkConfig.execute(input);
}
async function saveStudentReward(input) {
  requireCurrentFirebaseAuthUser();
  return saveStudent.execute(input);
}
async function awardAssessmentLevelUp(input) {
  requireCurrentFirebaseAuthUser();
  return awardLevelUp.execute(input);
}
async function awardAdditionalMissionCompletion(input) {
  requireCurrentFirebaseAuthUser();
  return awardAdditionalMission.execute(input);
}
async function awardDailyMissionCompletion(input) {
  requireCurrentFirebaseAuthUser();
  return awardDailyMission.execute(input);
}
async function awardStudentLogin(input) {
  requireCurrentFirebaseAuthUser();
  return awardLogin.execute(input);
}
async function getStudentRewardTotal(input) {
  requireCurrentFirebaseAuthUser();
  return getStudentTotal.execute(input);
}
function watchStudentRewardTotal(input) {
  requireCurrentFirebaseAuthUser();
  return watchStudentTotal.execute(input);
}
async function getStudentRewardCategoryTotal(input) {
  requireCurrentFirebaseAuthUser();
  return getCategoryTotal.execute(input);
}
async function listStudentRewardHistory(input) {
  requireCurrentFirebaseAuthUser();
  return listHistory.execute(input);
}
async function listRecentStudentRewardActivities(input) {
  requireCurrentFirebaseAuthUser();
  return listRecentActivities.execute(input);
}
export {
  RewardCategory, awardAssessmentLevelUp, awardAdditionalMissionCompletion, awardDailyMissionCompletion, awardStudentLogin, saveStudentReward, getStudentRewardTotal, watchStudentRewardTotal,
  getStudentRewardCategoryTotal, listStudentRewardHistory, listRecentStudentRewardActivities,
  DEFAULT_REWARD_CONFIG, getRewardConfig, saveRewardConfig,
  getAssessmentFrameworkRewardConfig, saveAssessmentFrameworkRewardConfig,
};
