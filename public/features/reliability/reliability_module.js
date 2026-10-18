/**
 * Feature APIs; none are Firebase callable endpoints.
 * getReliabilityConfig() -> Promise<ReliabilityConfig|null>
 * saveReliabilityConfig({percentagePerPractice}) -> Promise<ReliabilityConfig>
 * calculateTopicReliabilityScore({studentId, syllabusId, topicId})
 *   Counts both normal completions and submitted essays; grading is not required for reliability.
 *   -> Promise<{score: number, completedPracticeCount: number}>
 *   Counts distinct completed, topic-specific practices of any difficulty or type.
 *   Uses the saved percentage or the initial 10% rate; caps score at 100.
 * calculateSubjectReliabilityScore({studentId, syllabusId}) -> Promise<number|null>
 *   Averages latest saved topic scores over ALL current syllabus topics.
 *   Missing scores contribute zero; an empty syllabus returns null.
 *   Both calculations are read-only and reject an unknown syllabus/topic.
 * saveTopicReliabilityScore({studentId, syllabusId, score, completedPracticeCount, topicId})
 *   -> Promise<TopicReliabilityScore>
 * getTopicReliabilityScore({studentId, syllabusId, topicId})
 *   -> Promise<TopicReliabilityScore|null>
 * saveSubjectReliabilityScore({studentId, syllabusId, score})
 *   -> Promise<SubjectReliabilityScore>
 * getSubjectReliabilityScore({studentId, syllabusId}) -> Promise<SubjectReliabilityScore|null>
 * Saves replace the current score, including zero. Counts are supplied totals, not increments.
 * ReliabilityConfig: {percentagePerPractice, updatedAt: Date, updatedBy: string}
 * TopicReliabilityScore: {score, completedPracticeCount, updatedAt: Date}
 * SubjectReliabilityScore: {score, updatedAt: Date}
 */
/** Reads and score APIs require a signed-in user. Configuration writes require a site administrator. */
import {DEFAULT_PERCENTAGE_PER_PRACTICE} from "../../config/firebase/reliability_schema.js?v=20261008-reliability-v1";
import {FirestoreReliabilityConfigRepository} from "./infrastructure/firestore_reliability_config_repository.js?v=20261008-reliability-v1";
import {FirestoreReliabilityScoreRepository} from "./infrastructure/firestore_reliability_score_repository.js?v=20261008-reliability-v1";
import {getSyllabusById} from "../syllabus/syllabus_module.js?v=20261018-topic-framework-v1";
import {listCompletedPracticeIds} from "../student_practice/student_practice_module.js?v=20261018-topic-reset-v1";
import {listCompletedEssayPractices} from "../student_essay_practice/student_essay_practice_module.js?v=20261018-essay-reuse-v1";
import {getPracticeById} from "../practice/practice_module.js?v=20260824-completed-practices";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {GetReliabilityConfig} from "./application/get_reliability_config.js?v=20261008-reliability-v1";
import {SaveReliabilityConfig} from "./application/save_reliability_config.js?v=20261008-reliability-v1";
import {CalculateTopicReliabilityScore} from "./application/calculate_topic_reliability_score.js?v=20261018-essay-completion-metrics-v1";
import {CalculateSubjectReliabilityScore} from "./application/calculate_subject_reliability_score.js?v=20261008-reliability-v1";
import {SaveTopicReliabilityScore} from "./application/save_topic_reliability_score.js?v=20261008-reliability-v1";
import {GetTopicReliabilityScore} from "./application/get_topic_reliability_score.js?v=20261008-reliability-v1";
import {SaveSubjectReliabilityScore} from "./application/save_subject_reliability_score.js?v=20261008-reliability-v1";
import {GetSubjectReliabilityScore} from "./application/get_subject_reliability_score.js?v=20261008-reliability-v1";

const configRepository = new FirestoreReliabilityConfigRepository();
const scoreRepository = new FirestoreReliabilityScoreRepository();
const getConfig = new GetReliabilityConfig(configRepository);
const saveConfig = new SaveReliabilityConfig(configRepository, requireReliabilityAdministrator);
const getTopic = new GetTopicReliabilityScore(scoreRepository);
const saveTopic = new SaveTopicReliabilityScore(scoreRepository);
const getSubject = new GetSubjectReliabilityScore(scoreRepository);
const saveSubject = new SaveSubjectReliabilityScore(scoreRepository);
const calculateTopic = new CalculateTopicReliabilityScore({
  getReliabilityConfig, getSyllabusById, listCompletedPracticeIds, getPracticeById, listCompletedEssayPractices,
});
const calculateSubject = new CalculateSubjectReliabilityScore({
  getSyllabusById, getTopicReliabilityScore,
});

async function requireReliabilityAdministrator() {
  const user = requireCurrentFirebaseAuthUser();
  const status = await requireCurrentSiteAdmin();
  const currentUser = requireCurrentFirebaseAuthUser();
  if (currentUser.uid !== user.uid
      || currentUser.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in account changed. Try saving again.");
  }
  return currentUser;
}

async function getReliabilityConfig() {
  requireCurrentFirebaseAuthUser();
  return getConfig.execute();
}

async function saveReliabilityConfig(input) {
  return saveConfig.execute(input);
}

async function calculateTopicReliabilityScore(input) {
  requireCurrentFirebaseAuthUser();
  return calculateTopic.execute(input);
}

async function calculateSubjectReliabilityScore(input) {
  requireCurrentFirebaseAuthUser();
  return calculateSubject.execute(input);
}

async function saveTopicReliabilityScore(input) {
  requireCurrentFirebaseAuthUser();
  return saveTopic.execute(input);
}

async function getTopicReliabilityScore(input) {
  requireCurrentFirebaseAuthUser();
  return getTopic.execute(input);
}

async function saveSubjectReliabilityScore(input) {
  requireCurrentFirebaseAuthUser();
  return saveSubject.execute(input);
}

async function getSubjectReliabilityScore(input) {
  requireCurrentFirebaseAuthUser();
  return getSubject.execute(input);
}

export {
  DEFAULT_PERCENTAGE_PER_PRACTICE,
  getReliabilityConfig,
  saveReliabilityConfig,
  calculateTopicReliabilityScore,
  calculateSubjectReliabilityScore,
  saveTopicReliabilityScore,
  getTopicReliabilityScore,
  saveSubjectReliabilityScore,
  getSubjectReliabilityScore,
};
