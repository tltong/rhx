import {listAssignedFillInTheBlanksPractices, listCompletedFillInTheBlanksPractices, getAssignedFillInTheBlanksPractice, getCompletedFillInTheBlanksPractice} from "../student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module.js?v=20261104-fill-preassessment-v3";
/**
 * listAdditionalMissions({studentId, syllabusId}) -> [{practiceId, practiceType: "normal"|"essay", topicId}]
 * getAdditionalMissionAvailability({studentId, syllabusId}) -> {missions, preparingEssay}
 * The legacy listAdditionalMissionPracticeIds API returns normal-practice IDs only.
 * acceptAdditionalDailyMission accepts optional practiceType (default normal).
 * One additional mission per topic per day is shared across both practice types.
 */
import {GetAdditionalMissionAvailability} from "./application/get_additional_mission_availability.js?v=20261104-fill-firestore-v2";
import {listAssignedEssayPractices, listCompletedEssayPractices, getAssignedEssayPractice, getCompletedEssayPractice} from "../student_essay_practice/student_essay_practice_module.js?v=20261104-fill-preassessment-v3";
import {ListAdditionalMissions} from "./application/list_additional_missions.js?v=20261104-fill-preassessment-v3";
/**
 * Essay core missions include practiceType: "essay"; practiceId is the student essay attempt ID.
 * Omitted practiceType means a normal practice. Submission completes an essay mission before grading.
 *
 * Feature API
 *
 * getAcceptedAdditionalMissionForPractice({studentId: string, practiceId: string})
 *   -> Promise<{missionDate: string, syllabusId: string, topicId: string,
 *     practiceId: string}|null>
 * Read-only. Verifies the lookup against the accepted additional practice record.
 * Supports older records without a lookup and returns the latest acceptance.
 * Acceptance is independent of practice completion.
 *
 * getAcceptedDailyMissionForPractice({studentId: string, practiceId: string, practiceType?: "normal"|"essay"})
 *   -> Promise<{missionDate: string, syllabusId: string, topicId: string,
 *     practiceId: string}|null>
 * Read-only. Verifies the lookup against the accepted core mission record.
 * Reads older accepted records when no lookup exists. Returns the latest core
 * acceptance if the same practice was accepted on multiple mission days.
 * Acceptance is independent of whether the practice has been completed.
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
 * acceptCoreDailyMission({studentId: string, practiceId: string, practiceType?: "normal"|"essay"})
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
 * pauseCoreDailyMission({studentId: string, practiceId: string, practiceType?: "normal"|"essay"})
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
} from "./application/accept_core_daily_mission.js?v=20261104-fill-firestore-v2";
import {
  AcceptAdditionalDailyMission
} from "./application/accept_additional_daily_mission.js?v=20261104-fill-firestore-v2";
import {
  CheckPausedTopicValidity
} from "./application/check_paused_topic_validity.js?v=20261104-fill-preassessment-v3";
import {
  GetNextCoreDailyMission
} from "./application/get_next_core_daily_mission.js?v=20261104-fill-preassessment-v3";
import {GetAcceptedAdditionalMissionForPractice} from "./application/get_accepted_additional_mission_for_practice.js?v=20261104-fill-firestore-v2";
import {
  GetAcceptedDailyMissionForPractice
} from "./application/get_accepted_daily_mission_for_practice.js?v=20261104-fill-firestore-v2";
import {
  IsTopicPaused
} from "./application/is_topic_paused.js?v=20261104-fill-preassessment-v3";
import {
  ListAdditionalMissionPracticeIds
} from "./application/list_additional_mission_practice_ids.js?v=20261104-fill-preassessment-v3";
import {
  PauseCoreDailyMission
} from "./application/pause_core_daily_mission.js?v=20261104-fill-firestore-v2";
import {
  UnpauseTopic
} from "./application/unpause_topic.js?v=20261104-fill-preassessment-v3";
import {
  FirestoreDailyMissionRepository
} from "./infrastructure/firestore_daily_mission_repository.js?v=20261104-fill-preassessment-v3";
import {
  getPracticeById
} from "../practice/practice_module.js?v=20261104-fill-preassessment-v3";
import {
  listAssignedPracticeIds
} from "../student_practice/student_practice_module.js?v=20261104-fill-preassessment-v3";
import {
  isTopicPausable
} from "../syllabus/syllabus_module.js?v=20261104-fill-preassessment-v3";

const dailyMissionRepository = new FirestoreDailyMissionRepository();
const getAcceptedAdditionalMissionForPracticeUseCase = new GetAcceptedAdditionalMissionForPractice({dailyMissionRepository});
const getAcceptedDailyMissionForPracticeUseCase = new GetAcceptedDailyMissionForPractice({dailyMissionRepository});
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
  listAssignedEssayPractices, listAssignedFillInTheBlanksPractices,
  getPracticeById,
  checkPausedTopicValidity: runPausedTopicValidityCheck
});
const acceptCoreDailyMissionUseCase = new AcceptCoreDailyMission({
  dailyMissionRepository,
  getNextCoreDailyMission: (input) => (
    getNextCoreDailyMissionUseCase.execute(input)
  ),
  getPracticeById,
  getAssignedEssayPractice, getCompletedEssayPractice, getAssignedFillInTheBlanksPractice, getCompletedFillInTheBlanksPractice
});
const pauseCoreDailyMissionUseCase = new PauseCoreDailyMission({
  dailyMissionRepository,
  getPracticeById,
  isTopicPausable,
  getAssignedEssayPractice, getAssignedFillInTheBlanksPractice, getCompletedFillInTheBlanksPractice
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
    getAssignedEssayPractice, getCompletedEssayPractice, getAssignedFillInTheBlanksPractice, getCompletedFillInTheBlanksPractice,
    getPracticeById
  });
const listAdditionalMissionsUseCase = new ListAdditionalMissions({dailyMissionRepository, listAssignedPracticeIds,
  listAssignedEssayPractices, listAssignedFillInTheBlanksPractices, getPracticeById, checkPausedTopicValidity: runPausedTopicValidityCheck});
async function listAdditionalMissions(input) {return listAdditionalMissionsUseCase.execute(input);}
const additionalMissionAvailability = new GetAdditionalMissionAvailability({listAdditionalMissions,
  dailyMissionRepository, listCompletedEssayPractices, listCompletedFillInTheBlanksPractices, checkPausedTopicValidity: runPausedTopicValidityCheck,
  getCurrentDate: () => new Date().toISOString().slice(0, 10)});
async function getAdditionalMissionAvailability(input) {return additionalMissionAvailability.execute(input);}
const unpauseTopicUseCase = new UnpauseTopic({
  dailyMissionRepository
});

async function getAcceptedAdditionalMissionForPractice(input) {
  return getAcceptedAdditionalMissionForPracticeUseCase.execute(input);
}

async function getAcceptedDailyMissionForPractice(input) {
  return getAcceptedDailyMissionForPracticeUseCase.execute(input);
}

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
  listAdditionalMissions, getAdditionalMissionAvailability,
  acceptAdditionalDailyMission,
  acceptCoreDailyMission,
  getAcceptedAdditionalMissionForPractice,
  getAcceptedDailyMissionForPractice,
  getNextCoreDailyMission,
  isTopicPaused,
  listAdditionalMissionPracticeIds,
  pauseCoreDailyMission,
  unpauseTopic
};
