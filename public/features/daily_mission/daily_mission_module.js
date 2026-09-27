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
import {
  AcceptCoreDailyMission
} from "./application/accept_core_daily_mission.js";
import {
  AcceptAdditionalDailyMission
} from "./application/accept_additional_daily_mission.js";
import {
  CheckPausedTopicValidity
} from "./application/check_paused_topic_validity.js";
import {
  GetNextCoreDailyMission
} from "./application/get_next_core_daily_mission.js";
import {
  ListAdditionalMissionPracticeIds
} from "./application/list_additional_mission_practice_ids.js";
import {
  PauseCoreDailyMission
} from "./application/pause_core_daily_mission.js";
import {
  FirebaseCallableDailyMissionGateway
} from "./infrastructure/firebase_callable_daily_mission_gateway.js";

const dailyMissionGateway = new FirebaseCallableDailyMissionGateway();
const acceptCoreDailyMissionUseCase = new AcceptCoreDailyMission(
  dailyMissionGateway
);
const getNextCoreDailyMissionUseCase = new GetNextCoreDailyMission(
  dailyMissionGateway
);
const pauseCoreDailyMissionUseCase = new PauseCoreDailyMission(
  dailyMissionGateway
);
const listAdditionalMissionPracticeIdsUseCase =
  new ListAdditionalMissionPracticeIds(dailyMissionGateway);
const acceptAdditionalDailyMissionUseCase =
  new AcceptAdditionalDailyMission(dailyMissionGateway);
const checkPausedTopicValidityUseCase =
  new CheckPausedTopicValidity(dailyMissionGateway);

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

export {
  acceptAdditionalDailyMission,
  acceptCoreDailyMission,
  checkPausedTopicValidity,
  getNextCoreDailyMission,
  listAdditionalMissionPracticeIds,
  pauseCoreDailyMission
};
