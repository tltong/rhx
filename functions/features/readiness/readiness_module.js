/**
 * getReadinessConfig() -> Promise<ReadinessConfig|null>
 * saveReadinessConfig({difficultyWeights?, numberOfPractices?, preAssessmentWeight?}, {updatedBy})
 *   -> Promise<ReadinessConfig>. Supplied fields change atomically; other values are preserved.
 *   Trusted backend callers supply the administrator UID as context.
 * getDifficultyWeight(DifficultyLevel) -> Promise<number>
 * getReadinessPracticeCount() -> Promise<number>
 * setReadinessPracticeCount(numberOfPractices, {updatedBy}) -> Promise<number>
 * getPreAssessmentWeight() -> Promise<number>
 * setPreAssessmentWeight(preAssessmentWeight, {updatedBy}) -> Promise<number>
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
 * ReadinessScore: {score: number, updatedAt: Date}
 * ReadinessScoreHistoryEntry: {id: string, score: number, savedAt: Date, practiceId?: string, practiceType?: normal|essay}
 * DifficultyLevel: {EASY: "easy", MEDIUM: "medium", HARD: "hard"}
 * ReadinessConfig: {difficultyWeights, numberOfPractices, preAssessmentWeight, updatedAt: Date, updatedBy: string}
 */
const {
  DifficultyLevel,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
} = require("../../schema/readiness_config_schema");
const {GetReadinessConfig} = require("./application/get_readiness_config");
const {SaveReadinessConfig} = require("./application/save_readiness_config");
const {GetDifficultyWeight} = require("./application/get_difficulty_weight");
const {GetReadinessParameter} = require("./application/get_readiness_parameter");
const {CalculateReadinessScore} = require("./application/calculate_readiness_score");
const {CalculateSubjectReadinessScore} = require("./application/calculate_subject_readiness_score");
const {SaveReadinessScore} = require("./application/save_readiness_score");
const {GetReadinessScore} = require("./application/get_readiness_score");
const {GetReadinessScoreHistory} = require("./application/get_readiness_score_history");
const {SaveSubjectReadinessScore} = require("./application/save_subject_readiness_score");
const {GetSubjectReadinessScore} = require("./application/get_subject_readiness_score");
const {GetSubjectReadinessScoreHistory} = require("./application/get_subject_readiness_score_history");
const {FirestoreReadinessScoreRepository} = require("./infrastructure/firestore_readiness_score_repository");
const {listCompletedPractices} = require("../student_practice/student_practice_module");
const {listCompletedEssayPractices} = require("../student_essay_practice/student_essay_practice_module");
const {getEssayResult} = require("../essay_scoring/essay_scoring_module");
const {getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {getPracticeById, practiceTypes} = require("../practice/practice_module");
const {getQuestionDifficulty} = require("../question/question_module");
const {getSyllabusById} = require("../syllabus/syllabus_module");
const {
  FirestoreReadinessConfigRepository,
} = require("./infrastructure/firestore_readiness_config_repository");

const repository = new FirestoreReadinessConfigRepository();
const getConfig = new GetReadinessConfig(repository);
const saveConfig = new SaveReadinessConfig(repository);
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
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT,
});
const saveScore = new SaveReadinessScore(scoreRepository);
const getScore = new GetReadinessScore(scoreRepository);
const getScoreHistory = new GetReadinessScoreHistory(scoreRepository);
const saveSubjectScore = new SaveSubjectReadinessScore(scoreRepository);
const getSubjectScore = new GetSubjectReadinessScore(scoreRepository);
const getSubjectScoreHistory = new GetSubjectReadinessScoreHistory(scoreRepository);
const calculateSubjectScore = new CalculateSubjectReadinessScore({
  getSyllabusById,
  getReadinessScore,
});

async function getReadinessConfig() {
  return getConfig.execute();
}

async function saveReadinessConfig(input, context) {
  return saveConfig.execute(input, context);
}

async function getDifficultyWeight(difficultyLevel) {
  return getWeight.execute(difficultyLevel);
}

async function getReadinessPracticeCount() {
  return getPracticeCount.execute();
}

async function setReadinessPracticeCount(numberOfPractices, context) {
  const config = await saveConfig.execute({numberOfPractices}, context);
  return config.numberOfPractices;
}

async function getPreAssessmentWeight() {
  return getPreAssessmentWeightUseCase.execute();
}

async function setPreAssessmentWeight(preAssessmentWeight, context) {
  const config = await saveConfig.execute({preAssessmentWeight}, context);
  return config.preAssessmentWeight;
}

async function calculateReadinessScore(input) {
  return calculateScore.execute(input);
}

async function calculateSubjectReadinessScore(input) {
  return calculateSubjectScore.execute(input);
}

async function saveReadinessScore(input) {
  return saveScore.execute(input);
}

async function getReadinessScore(input) {
  return getScore.execute(input);
}

async function getReadinessScoreHistory(input) {
  return getScoreHistory.execute(input);
}

async function saveSubjectReadinessScore(input) {
  return saveSubjectScore.execute(input);
}

async function getSubjectReadinessScore(input) {
  return getSubjectScore.execute(input);
}

async function getSubjectReadinessScoreHistory(input) {
  return getSubjectScoreHistory.execute(input);
}

module.exports = {
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
  getSubjectReadinessScoreHistory,
};
