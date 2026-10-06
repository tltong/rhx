/**
 * Feature API
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
 * This operation may remove pause records whose 14-day validity has expired.
 * It does not store an unaccepted mission suggestion.
 * Each subject has at most one accepted Daily Mission per day.
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
 * Rejects topics whose syllabus pausable flag is false.
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
 * Available only after today's Daily Mission for the subject is completed.
 * Returns one practice per eligible topic that has no Additional Mission today.
 * Returned practices use the same topic priority as core Daily Missions:
 * never accepted first, then the least recently accepted topic.
 * This operation may remove pause records whose 14-day validity has expired.
 *
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
 * isTopicPaused({studentId: string, syllabusId: string, topicId: string})
 *   -> Promise<boolean>
 *   This operation reads Firestore directly and never changes pause records.
 *
 * unpauseTopic({studentId: string, syllabusId: string, topicId: string})
 *   -> Promise<{
 *     studentId: string,
 *     syllabusId: string,
 *     topicId: string,
 *     isPaused: false
 *   }>
 */
import {
  AcceptCoreDailyMission
} from "./application/accept_core_daily_mission.js";
import {
  AcceptAdditionalDailyMission
} from "./application/accept_additional_daily_mission.js?v=20261001-direct-additional-accept-v1";
import {
  CheckPausedTopicValidity
} from "./application/check_paused_topic_validity.js";
import {
  GetNextCoreDailyMission
} from "./application/get_next_core_daily_mission.js?v=20261001-direct-core-v1";
import {
  IsTopicPaused
} from "./application/is_topic_paused.js";
import {
  ListAdditionalMissionPracticeIds
} from "./application/list_additional_mission_practice_ids.js?v=20261004-subject-topic-missions-v1";
import {
  PauseCoreDailyMission
} from "./application/pause_core_daily_mission.js?v=20261004-pausable-missions-v1";
import {
  UnpauseTopic
} from "./application/unpause_topic.js";
import {
  FirestoreDailyMissionRepository
} from "./infrastructure/firestore_daily_mission_repository.js?v=20261004-subject-topic-missions-v1";
import {
  getPracticeById
} from "../practice/practice_module.js?v=20260824-completed-practices";
import {
  listAssignedPracticeIds
} from "../student_practice/student_practice_module.js?v=20260824-completed-practices";
import {
  isTopicPausable
} from "../syllabus/syllabus_module.js?v=20261004-topic-pausable-v1";

const dailyMissionRepository = new FirestoreDailyMissionRepository();
const checkPausedTopicValidityUseCase = new CheckPausedTopicValidity({
  dailyMissionRepository
});
const runPausedTopicValidityCheck = (input) => (
  checkPausedTopicValidityUseCase.execute(input)
);
const isTopicPausedUseCase = new IsTopicPaused({
  dailyMissionRepository
});
const getNextCoreDailyMissionUseCase = new GetNextCoreDailyMission({
  dailyMissionRepository,
  listAssignedPracticeIds,
  getPracticeById,
  checkPausedTopicValidity: runPausedTopicValidityCheck
});
const acceptCoreDailyMissionUseCase = new AcceptCoreDailyMission({
  dailyMissionRepository,
  getNextCoreDailyMission: (input) => (
    getNextCoreDailyMissionUseCase.execute(input)
  ),
  getPracticeById
});
const pauseCoreDailyMissionUseCase = new PauseCoreDailyMission({
  dailyMissionRepository,
  getPracticeById,
  isTopicPausable
});
const listAdditionalMissionPracticeIdsUseCase =
  new ListAdditionalMissionPracticeIds({
    dailyMissionRepository,
    listAssignedPracticeIds,
    getPracticeById,
    checkPausedTopicValidity: runPausedTopicValidityCheck
  });
const acceptAdditionalDailyMissionUseCase =
  new AcceptAdditionalDailyMission({
    dailyMissionRepository,
    getPracticeById
  });
const unpauseTopicUseCase = new UnpauseTopic({
  dailyMissionRepository
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

async function isTopicPaused(input) {
  return isTopicPausedUseCase.execute(input);
}

async function unpauseTopic(input) {
  return unpauseTopicUseCase.execute(input);
}

export {
  acceptAdditionalDailyMission,
  acceptCoreDailyMission,
  getNextCoreDailyMission,
  isTopicPaused,
  listAdditionalMissionPracticeIds,
  pauseCoreDailyMission,
  unpauseTopic
};
