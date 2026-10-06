/**
 * getReadinessConfig() -> Promise<ReadinessConfig|null>
 * saveReadinessConfig({difficultyWeights?, numberOfPractices?, preAssessmentWeight?})
 *   -> Promise<ReadinessConfig>. Supplied fields change atomically; other values are preserved.
 *   Requires a current site administrator. Uses Firestore directly.
 * getDifficultyWeight(DifficultyLevel) -> Promise<number>
 * getReadinessPracticeCount() -> Promise<number>
 * setReadinessPracticeCount(numberOfPractices) -> Promise<number>
 * getPreAssessmentWeight() -> Promise<number>
 * setPreAssessmentWeight(preAssessmentWeight) -> Promise<number>
 *   Requires saved configuration. Existing question labels are normalized.
 * DifficultyLevel: {EASY: "easy", MEDIUM: "medium", HARD: "hard"}
 * DEFAULT_DIFFICULTY_WEIGHTS: initial form values, persisted only on save.
 * ReadinessConfig: {difficultyWeights, numberOfPractices, preAssessmentWeight, updatedAt: Date, updatedBy: string}
 * calculateReadinessScore({studentId, syllabusId, topicId}) -> Promise<number|null>
 *   Averages score times weight for the latest configured N practices of this topic.
 *   Uses available practices when fewer than N; returns null when none exist.
 *   Requires saved configuration. Does not persist or cap the result at 100.
 * saveReadinessScore({studentId, syllabusId, topicId, score, practiceId?}) -> Promise<ReadinessScore>
 *   Atomically updates the latest score and appends history.
 *   Supplying practiceId retains one entry per completion; retries return the
 *   original saved score without changing the latest score or adding history.
 *   Without practiceId, every save appends a new history entry.
 * getReadinessScore({studentId, syllabusId, topicId}) -> Promise<ReadinessScore|null>
 * getReadinessScoreHistory({studentId, syllabusId, topicId})
 *   -> Promise<ReadinessScoreHistoryEntry[]> sorted newest first.
 *   Score APIs require a signed-in user and use Firestore directly.
 * ReadinessScore: {score: number, updatedAt: Date}
 * ReadinessScoreHistoryEntry: {id: string, score: number, savedAt: Date, practiceId?: string}
 */
import {
  DifficultyLevel,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT
} from "../../config/firebase/readiness_config_schema.js?v=20261006-readiness-feature-api-v1";
import {GetReadinessConfig} from "./application/get_readiness_config.js?v=20261006-readiness-feature-api-v1";
import {SaveReadinessConfig} from "./application/save_readiness_config.js?v=20261006-readiness-feature-api-v1";
import {GetDifficultyWeight} from "./application/get_difficulty_weight.js?v=20261006-readiness-feature-api-v1";
import {GetReadinessParameter} from "./application/get_readiness_parameter.js?v=20261006-readiness-feature-api-v1";
import {
  FirestoreReadinessConfigRepository
} from "./infrastructure/firestore_readiness_config_repository.js?v=20261006-readiness-feature-api-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {CalculateReadinessScore} from "./application/calculate_readiness_score.js?v=20261007-readiness-completion-v1";
import {SaveReadinessScore} from "./application/save_readiness_score.js?v=20261007-readiness-completion-v1";
import {GetReadinessScore} from "./application/get_readiness_score.js?v=20261007-readiness-completion-v1";
import {GetReadinessScoreHistory} from "./application/get_readiness_score_history.js?v=20261007-readiness-completion-v1";
import {FirestoreReadinessScoreRepository} from "./infrastructure/firestore_readiness_score_repository.js?v=20261007-readiness-completion-v1";
import {listCompletedPractices} from "../student_practice/student_practice_module.js?v=20261006-readiness-scores-v1";
import {getPracticeById, practiceTypes} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {getQuestionDifficulty} from "../question/question_module.js?v=20260822-assessment-progression";

const repository = new FirestoreReadinessConfigRepository();
const getConfig = new GetReadinessConfig(repository);
const saveConfig = new SaveReadinessConfig(repository, requireReadinessAdministrator);
const getWeight = new GetDifficultyWeight(getReadinessConfig);
const getPracticeCount = new GetReadinessParameter(getReadinessConfig, "numberOfPractices");
const getPreAssessmentWeightUseCase = new GetReadinessParameter(getReadinessConfig, "preAssessmentWeight");
const scoreRepository = new FirestoreReadinessScoreRepository();
const calculateScore = new CalculateReadinessScore({
  getReadinessConfig,
  listCompletedPractices,
  getPracticeById,
  getQuestionDifficulty,
  assessmentPracticeType: practiceTypes.ASSESSMENT,
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT
});
const saveScore = new SaveReadinessScore(scoreRepository);
const getScore = new GetReadinessScore(scoreRepository);
const getScoreHistory = new GetReadinessScoreHistory(scoreRepository);

async function requireReadinessAdministrator() {
  const user = requireCurrentFirebaseAuthUser();
  const status = await requireCurrentSiteAdmin();
  const currentUser = requireCurrentFirebaseAuthUser();
  if (currentUser.uid !== user.uid
      || currentUser.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in account changed. Try saving again.");
  }
  return currentUser;
}

async function getReadinessConfig() {
  requireCurrentFirebaseAuthUser();
  return getConfig.execute();
}

async function saveReadinessConfig(input) {
  return saveConfig.execute(input);
}

async function getDifficultyWeight(difficultyLevel) {
  return getWeight.execute(difficultyLevel);
}

async function getReadinessPracticeCount() {
  return getPracticeCount.execute();
}

async function setReadinessPracticeCount(numberOfPractices) {
  const config = await saveReadinessConfig({numberOfPractices});
  return config.numberOfPractices;
}

async function getPreAssessmentWeight() {
  return getPreAssessmentWeightUseCase.execute();
}

async function setPreAssessmentWeight(preAssessmentWeight) {
  const config = await saveReadinessConfig({preAssessmentWeight});
  return config.preAssessmentWeight;
}

async function calculateReadinessScore(input) {
  requireCurrentFirebaseAuthUser();
  return calculateScore.execute(input);
}

async function saveReadinessScore(input) {
  requireCurrentFirebaseAuthUser();
  return saveScore.execute(input);
}

async function getReadinessScore(input) {
  requireCurrentFirebaseAuthUser();
  return getScore.execute(input);
}

async function getReadinessScoreHistory(input) {
  requireCurrentFirebaseAuthUser();
  return getScoreHistory.execute(input);
}

export {
  DifficultyLevel,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
  getReadinessConfig,
  saveReadinessConfig,
  getDifficultyWeight,
  getReadinessPracticeCount,
  setReadinessPracticeCount,
  getPreAssessmentWeight,
  setPreAssessmentWeight,
  calculateReadinessScore,
  saveReadinessScore,
  getReadinessScore,
  getReadinessScoreHistory
};
