const {getCompletedEssayPractice} = require("../student_essay_practice/student_essay_practice_module");
/**
 * Feature APIs; none are Firebase callable endpoints.
 * awardAssessmentLevelUp({studentId, practiceId})
 *   -> Promise<{awards, coinsAwarded, totalCoins, categoryTotalCoins, alreadyAwarded}|null>
 * Reads the saved assessment transition and completion, then awards every newly
 * reached level using framework levelCoins, for normal or essay practices.
 * The saved assessment determines which completion collection to verify.
 * The first level is the initial baseline.
 * Each student/syllabus/topic/framework/level is awarded once. Jumps commit all
 * eligible rewards together; retries retain the first amounts. Returns null when
 * no saved level-up exists. Missing regular-level configuration fails; endLevel
 * has an optional allocation, default 0. Web writes require a site administrator.
 *
 * awardStudentLogin({studentId, loginDate})
 *   -> Promise<{dailyReward, streakReward}>
 * Reads the saved login and its original streak snapshot. Awards configured daily
 * coins (unsaved default 1) and a bonus at 3, 7, 14 or 30 consecutive login days.
 * Missing login records fail with "not-found" unless a committed award plan exists.
 * Retries retain that plan, including after login history has been pruned.
 * awardAdditionalMissionCompletion({studentId, practiceId, practiceType?})
 *   -> Promise<{award, totalCoins, categoryTotalCoins, alreadyAwarded}|null>
 * Verifies accepted Additional Mission and saved completion, then awards
 * bonusMissionCompletionCoins (unsaved default 20), once per student/subject/topic/day.
 * Returns null when no accepted Additional Mission exists; incomplete missions
 * fail with "failed-precondition". Retries retain the original coin amount.
 *
 * awardDailyMissionCompletion({studentId, practiceId, practiceType?: "normal"|"essay"})
 *   -> Promise<{award, totalCoins, categoryTotalCoins, alreadyAwarded}|null>
 * Verifies accepted Daily Mission and saved practice completion, then awards
 * configured dailyMissionCompletionCoins (unsaved default 25).
 * Returns null for a practice without an accepted Daily Mission; an accepted
 * but incomplete practice fails with "failed-precondition".
 * Awards once per student/subject/mission day; retries retain the original coins.
 * saveStudentReward({studentId, categoryId, awardId, coins, sourceId, details})
 *   -> Promise<{award: StudentRewardHistoryEntry, totalCoins, categoryTotalCoins, alreadyAwarded}>
 * getStudentRewardTotal({studentId}) -> Promise<number>
 * getStudentRewardCategoryTotal({studentId, categoryId}) -> Promise<number>
 * listStudentRewardHistory({studentId, categoryId, limit?, cursor?})
 *   -> Promise<{entries: StudentRewardHistoryEntry[], nextCursor: object|null}>
 * listRecentStudentRewardActivities({studentId, limit})
 *   -> Promise<StudentRewardHistoryEntry[]>
 * Returns the newest positive-coin entries across every reward category. The
 * required limit is configured by the caller from recentActivitiesLimit.
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

/** Configuration writes require trusted context {updatedBy: administratorUid}.
 * Student award writes are for trusted backend callers, including triggers. */
const {DEFAULT_REWARD_CONFIG, RewardCategory} = require("../../schema/reward_schema");
const {FirestoreStudentRewardRepository} = require("./infrastructure/firestore_student_reward_repository");
const {SaveStudentReward} = require("./application/save_student_reward");
const {AwardAdditionalMissionCompletion} = require("./application/award_additional_mission_completion");
const {AwardDailyMissionCompletion} = require("./application/award_daily_mission_completion");
const {AwardAssessmentLevelUp} = require("./application/award_assessment_level_up");
const {getStudentPracticeAssessment} = require("../student_assessment_progress/student_assessment_progress_module");
const {AwardStudentLogin} = require("./application/award_student_login");
const {getStudentLoginRecord, listStudentLoginHistory} = require("../student_login/student_login_module");
const {getAcceptedAdditionalMissionForPractice, getAcceptedDailyMissionForPractice} = require("../daily_mission/daily_mission_module");
const {listCompletedPracticeIds} = require("../student_practice/student_practice_module");
const {GetStudentRewardTotal} = require("./application/get_student_reward_total");
const {GetStudentRewardCategoryTotal} = require("./application/get_student_reward_category_total");
const {ListStudentRewardHistory} = require("./application/list_student_reward_history");
const {ListRecentStudentRewardActivities} = require("./application/list_recent_student_reward_activities");
const {requireAdministratorUid} = require("./domain/reward_config");
const {FirestoreRewardConfigRepository} = require("./infrastructure/firestore_reward_config_repository");
const {getAssessmentFrameworkById, ASSESSMENT_FRAMEWORK_END_LEVEL_ID} = require("../assessment_framework/assessment_framework_module");
const {GetRewardConfig} = require("./application/get_reward_config");
const {GetAssessmentFrameworkRewardConfig} = require("./application/get_assessment_framework_reward_config");
const {SaveRewardConfig} = require("./application/save_reward_config");
const {SaveAssessmentFrameworkRewardConfig} = require("./application/save_assessment_framework_reward_config");

const repository = new FirestoreRewardConfigRepository();
const studentRepository = new FirestoreStudentRewardRepository();
const saveStudent = new SaveStudentReward(studentRepository);
const getStudentTotal = new GetStudentRewardTotal(studentRepository);
const getCategoryTotal = new GetStudentRewardCategoryTotal(studentRepository);
const listHistory = new ListStudentRewardHistory(studentRepository);
const listRecentActivities = new ListRecentStudentRewardActivities(studentRepository);
const getConfig = new GetRewardConfig(repository);
const awardLevelUp = new AwardAssessmentLevelUp({
  studentRewardRepository: studentRepository, getStudentPracticeAssessment, listCompletedPracticeIds, getCompletedEssayPractice,
  getAssessmentFrameworkRewardConfig,
});
const awardLogin = new AwardStudentLogin({
  studentRewardRepository: studentRepository, getStudentLoginRecord,
  listStudentLoginHistory, getRewardConfig,
});
const awardAdditionalMission = new AwardAdditionalMissionCompletion({
  studentRewardRepository: studentRepository, getAcceptedAdditionalMissionForPractice,
  listCompletedPracticeIds, getCompletedEssayPractice, getRewardConfig,
});
const awardDailyMission = new AwardDailyMissionCompletion({
  studentRewardRepository: studentRepository, getAcceptedDailyMissionForPractice,
  listCompletedPracticeIds, getCompletedEssayPractice, getRewardConfig,
});
const saveConfig = new SaveRewardConfig(repository, requireRewardAdministrator);
const getFrameworkConfig = new GetAssessmentFrameworkRewardConfig(repository);
const saveFrameworkConfig = new SaveAssessmentFrameworkRewardConfig(repository, {
  requireAdministrator: requireRewardAdministrator, getAssessmentFrameworkById,
  endLevelId: ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
});

function requireRewardAdministrator(context) {
  return {uid: requireAdministratorUid(context?.updatedBy)};
}
async function getRewardConfig() { return getConfig.execute(); }
async function saveRewardConfig(input, context) { return saveConfig.execute(input, context); }
async function getAssessmentFrameworkRewardConfig(input) { return getFrameworkConfig.execute(input); }
async function saveAssessmentFrameworkRewardConfig(input, context) { return saveFrameworkConfig.execute(input, context); }

async function saveStudentReward(input) { return saveStudent.execute(input); }
async function awardAssessmentLevelUp(input) {
  return awardLevelUp.execute(input);
}
async function awardAdditionalMissionCompletion(input) {
  return awardAdditionalMission.execute(input);
}
async function awardDailyMissionCompletion(input) { return awardDailyMission.execute(input); }
async function awardStudentLogin(input) { return awardLogin.execute(input); }
async function getStudentRewardTotal(input) { return getStudentTotal.execute(input); }
async function getStudentRewardCategoryTotal(input) { return getCategoryTotal.execute(input); }
async function listStudentRewardHistory(input) { return listHistory.execute(input); }
async function listRecentStudentRewardActivities(input) { return listRecentActivities.execute(input); }

module.exports = {
  RewardCategory, awardAssessmentLevelUp, awardAdditionalMissionCompletion, awardDailyMissionCompletion, awardStudentLogin, saveStudentReward, getStudentRewardTotal,
  getStudentRewardCategoryTotal, listStudentRewardHistory, listRecentStudentRewardActivities,
  DEFAULT_REWARD_CONFIG, getRewardConfig, saveRewardConfig,
  getAssessmentFrameworkRewardConfig, saveAssessmentFrameworkRewardConfig,
};
