/**
 * External API
 *
 * getNextCoreDailyMission({studentId: string, syllabusId: string})
 *   -> Promise<{
 *     studentId: string,
 *     syllabusId: string,
 *     topicId: string,
 *     practiceId: string,
 *     date: string,
 *     isAccepted: boolean
 *   }|null>
 *
 * The operation is read-only. A false isAccepted value represents a
 * suggestion; a true value means today's accepted core mission already exists.
 *
 * acceptCoreDailyMission({studentId: string, practiceId: string})
 *   -> Promise<{
 *     studentId: string,
 *     syllabusId: string,
 *     topicId: string,
 *     practiceId: string,
 *     date: string,
 *     isAccepted: true,
 *     created: boolean
 *   }>
 *
 * pauseCoreDailyMission({studentId: string, practiceId: string})
 *   -> Promise<{
 *     studentId: string,
 *     syllabusId: string,
 *     topicId: string,
 *     practiceId: string,
 *     pausedDate: string,
 *     isPaused: true,
 *     created: boolean
 *   }>
 *
 * listAdditionalMissionPracticeIds({studentId: string, syllabusId: string})
 *   -> Promise<string[]>
 *
 * acceptAdditionalDailyMission({studentId: string, practiceId: string})
 *   -> Promise<{
 *     studentId: string,
 *     syllabusId: string,
 *     topicId: string,
 *     practiceId: string,
 *     date: string,
 *     isAccepted: true,
 *     created: boolean
 *   }>
 *
 * checkPausedTopicValidity({studentId: string, syllabusId: string,
 *   topicId: string})
 *   -> Promise<{
 *     studentId: string,
 *     syllabusId: string,
 *     topicId: string,
 *     pausedDate: string|null,
 *     isPaused: boolean,
 *     unpaused: boolean
 *   }>
 */
const {
  getPracticeById,
} = require("../practice/practice_module");
const {
  listAssignedPracticeIds,
} = require("../student_practice/student_practice_module");
const {
  AcceptCoreDailyMission,
} = require("./application/accept_core_daily_mission");
const {
  AcceptAdditionalDailyMission,
} = require("./application/accept_additional_daily_mission");
const {
  CheckPausedTopicValidity,
} = require("./application/check_paused_topic_validity");
const {
  GetNextCoreDailyMission,
} = require("./application/get_next_core_daily_mission");
const {
  ListAdditionalMissionPracticeIds,
} = require("./application/list_additional_mission_practice_ids");
const {
  PauseCoreDailyMission,
} = require("./application/pause_core_daily_mission");
const {
  FirestoreDailyMissionRepository,
} = require("./infrastructure/firestore_daily_mission_repository");

const dailyMissionRepository = new FirestoreDailyMissionRepository();
const checkPausedTopicValidityUseCase = new CheckPausedTopicValidity({
  dailyMissionRepository,
});
const runPausedTopicValidityCheck = (input) => (
  checkPausedTopicValidityUseCase.execute(input)
);
const getNextCoreDailyMissionUseCase = new GetNextCoreDailyMission({
  dailyMissionRepository,
  listAssignedPracticeIds,
  getPracticeById,
  checkPausedTopicValidity: runPausedTopicValidityCheck,
});

const acceptCoreDailyMissionUseCase = new AcceptCoreDailyMission({
  dailyMissionRepository,
  getNextCoreDailyMission: (input) => (
    getNextCoreDailyMissionUseCase.execute(input)
  ),
  getPracticeById,
});
const pauseCoreDailyMissionUseCase = new PauseCoreDailyMission({
  dailyMissionRepository,
  getPracticeById,
});
const listAdditionalMissionPracticeIdsUseCase =
  new ListAdditionalMissionPracticeIds({
    dailyMissionRepository,
    listAssignedPracticeIds,
    getPracticeById,
    checkPausedTopicValidity: runPausedTopicValidityCheck,
  });
const acceptAdditionalDailyMissionUseCase =
  new AcceptAdditionalDailyMission({
    dailyMissionRepository,
    getPracticeById,
  });

async function getNextCoreDailyMission(input) {
  return getNextCoreDailyMissionUseCase.execute(input);
}

async function acceptCoreDailyMission(input) {
  return acceptCoreDailyMissionUseCase.execute(input);
}

async function pauseCoreDailyMission(input) {
  return pauseCoreDailyMissionUseCase.execute(input);
}

async function listAdditionalMissionPracticeIds(input) {
  return listAdditionalMissionPracticeIdsUseCase.execute(input);
}

async function acceptAdditionalDailyMission(input) {
  return acceptAdditionalDailyMissionUseCase.execute(input);
}

async function checkPausedTopicValidity(input) {
  return checkPausedTopicValidityUseCase.execute(input);
}

module.exports = {
  acceptAdditionalDailyMission,
  acceptCoreDailyMission,
  checkPausedTopicValidity,
  getNextCoreDailyMission,
  listAdditionalMissionPracticeIds,
  pauseCoreDailyMission,
};
