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
 *   Includes graded essay completions with the saved question's difficulty weight.
 *   Pending grades and results for a different submitted answer do not contribute.
 *   Requires saved configuration. Does not persist or cap the result at 100.
 * calculateSubjectReadinessScore({studentId, syllabusId}) -> Promise<number|null>
 *   Equally averages the latest saved scores of current syllabus topics.
 *   Includes zero, excludes missing scores, and returns null when none exist.
 *   Throws not-found for an unknown syllabus. Does not recalculate topics or persist.
 * saveReadinessScore({studentId, syllabusId, topicId, score, practiceId?, practiceType?}) -> Promise<ReadinessScore>
 *   Atomically updates the latest score and appends history.
 *   Supplying practiceId retains one entry per completion; retries return the
 *   original saved score without changing the latest score or adding history.
 *   Without practiceId, every save appends a new history entry.
 *   practiceType: normal|essay; omitted means normal. Essay sources have separate history keys.
 * getReadinessScore({studentId, syllabusId, topicId}) -> Promise<ReadinessScore|null>
 * getReadinessScoreHistory({studentId, syllabusId, topicId})
 *   -> Promise<ReadinessScoreHistoryEntry[]> sorted newest first.
 * saveSubjectReadinessScore({studentId, syllabusId, score, practiceId?, practiceType?}) -> Promise<ReadinessScore>
 *   Atomically updates the latest subject score and appends subject history.
 *   The same practiceId retry rules apply as for topic score saves.
 * getSubjectReadinessScore({studentId, syllabusId}) -> Promise<ReadinessScore|null>
 * getSubjectReadinessScoreHistory({studentId, syllabusId})
 *   -> Promise<ReadinessScoreHistoryEntry[]> sorted newest first.
 *   Score APIs require a signed-in user and use Firestore directly.
 * ReadinessScore: {score: number, updatedAt: Date}
 * ReadinessScoreHistoryEntry: {id: string, score: number, savedAt: Date, practiceId?: string, practiceType?: normal|essay}
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
import {CalculateReadinessScore} from "./application/calculate_readiness_score.js?v=20261018-essay-completion-metrics-v1";
import {CalculateSubjectReadinessScore} from "./application/calculate_subject_readiness_score.js?v=20261008-subject-readiness-v1";
import {SaveReadinessScore} from "./application/save_readiness_score.js?v=20261018-essay-completion-metrics-v1";
import {GetReadinessScore} from "./application/get_readiness_score.js?v=20261007-readiness-completion-v1";
import {GetReadinessScoreHistory} from "./application/get_readiness_score_history.js?v=20261007-readiness-completion-v1";
import {SaveSubjectReadinessScore} from "./application/save_subject_readiness_score.js?v=20261018-essay-completion-metrics-v1";
import {GetSubjectReadinessScore} from "./application/get_subject_readiness_score.js?v=20261008-subject-readiness-v2";
import {GetSubjectReadinessScoreHistory} from "./application/get_subject_readiness_score_history.js?v=20261008-subject-readiness-v2";
import {FirestoreReadinessScoreRepository} from "./infrastructure/firestore_readiness_score_repository.js?v=20261018-essay-completion-metrics-v1";
import {listCompletedPractices} from "../student_practice/student_practice_module.js?v=20261018-topic-reset-v1";
import {listCompletedEssayPractices} from "../student_essay_practice/student_essay_practice_module.js?v=20261018-essay-reuse-v1";
import {getEssayResult} from "../essay_scoring/essay_scoring_module.js?v=20261018-essay-review-comment-v1";
import {getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {getPracticeById, practiceTypes} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {getQuestionDifficulty} from "../question/question_module.js?v=20260822-assessment-progression";
import {getSyllabusById} from "../syllabus/syllabus_module.js?v=20261018-topic-framework-v1";

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
  listCompletedEssayPractices, getEssayResult, getEssayQuestionById,
  getPracticeById,
  getQuestionDifficulty,
  assessmentPracticeType: practiceTypes.ASSESSMENT,
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT
});
const saveScore = new SaveReadinessScore(scoreRepository);
const getScore = new GetReadinessScore(scoreRepository);
const getScoreHistory = new GetReadinessScoreHistory(scoreRepository);
const saveSubjectScore = new SaveSubjectReadinessScore(scoreRepository);
const getSubjectScore = new GetSubjectReadinessScore(scoreRepository);
const getSubjectScoreHistory = new GetSubjectReadinessScoreHistory(scoreRepository);
const calculateSubjectScore = new CalculateSubjectReadinessScore({
  getSyllabusById,
  getReadinessScore
});

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

async function calculateSubjectReadinessScore(input) {
  requireCurrentFirebaseAuthUser();
  return calculateSubjectScore.execute(input);
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

async function saveSubjectReadinessScore(input) {
  requireCurrentFirebaseAuthUser();
  return saveSubjectScore.execute(input);
}

async function getSubjectReadinessScore(input) {
  requireCurrentFirebaseAuthUser();
  return getSubjectScore.execute(input);
}

async function getSubjectReadinessScoreHistory(input) {
  requireCurrentFirebaseAuthUser();
  return getSubjectScoreHistory.execute(input);
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
  calculateSubjectReadinessScore,
  saveReadinessScore,
  getReadinessScore,
  getReadinessScoreHistory,
  saveSubjectReadinessScore,
  getSubjectReadinessScore,
  getSubjectReadinessScoreHistory
};
