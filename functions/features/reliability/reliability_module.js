/**
 * Feature APIs; none are Firebase callable endpoints.
 * getReliabilityConfig() -> Promise<ReliabilityConfig|null>
 * saveReliabilityConfig({percentagePerPractice}) -> Promise<ReliabilityConfig>
 * calculateTopicReliabilityScore({studentId, syllabusId, topicId})
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
/** Configuration writes require trusted backend context {updatedBy: administratorUid}. */
const {DEFAULT_PERCENTAGE_PER_PRACTICE} = require("../../schema/reliability_schema");
const {FirestoreReliabilityConfigRepository} = require("./infrastructure/firestore_reliability_config_repository");
const {FirestoreReliabilityScoreRepository} = require("./infrastructure/firestore_reliability_score_repository");
const {getSyllabusById} = require("../syllabus/syllabus_module");
const {listCompletedPracticeIds} = require("../student_practice/student_practice_module");
const {getPracticeById} = require("../practice/practice_module");
const {GetReliabilityConfig} = require("./application/get_reliability_config");
const {SaveReliabilityConfig} = require("./application/save_reliability_config");
const {CalculateTopicReliabilityScore} = require("./application/calculate_topic_reliability_score");
const {CalculateSubjectReliabilityScore} = require("./application/calculate_subject_reliability_score");
const {SaveTopicReliabilityScore} = require("./application/save_topic_reliability_score");
const {GetTopicReliabilityScore} = require("./application/get_topic_reliability_score");
const {SaveSubjectReliabilityScore} = require("./application/save_subject_reliability_score");
const {GetSubjectReliabilityScore} = require("./application/get_subject_reliability_score");

const configRepository = new FirestoreReliabilityConfigRepository();
const scoreRepository = new FirestoreReliabilityScoreRepository();
const getConfig = new GetReliabilityConfig(configRepository);
const saveConfig = new SaveReliabilityConfig(configRepository);
const getTopic = new GetTopicReliabilityScore(scoreRepository);
const saveTopic = new SaveTopicReliabilityScore(scoreRepository);
const getSubject = new GetSubjectReliabilityScore(scoreRepository);
const saveSubject = new SaveSubjectReliabilityScore(scoreRepository);
const calculateTopic = new CalculateTopicReliabilityScore({
  getReliabilityConfig, getSyllabusById, listCompletedPracticeIds, getPracticeById,
});
const calculateSubject = new CalculateSubjectReliabilityScore({
  getSyllabusById, getTopicReliabilityScore,
});

async function getReliabilityConfig() {
  return getConfig.execute();
}

async function saveReliabilityConfig(input, context) {
  return saveConfig.execute(input, context);
}

async function calculateTopicReliabilityScore(input) {
  return calculateTopic.execute(input);
}

async function calculateSubjectReliabilityScore(input) {
  return calculateSubject.execute(input);
}

async function saveTopicReliabilityScore(input) {
  return saveTopic.execute(input);
}

async function getTopicReliabilityScore(input) {
  return getTopic.execute(input);
}

async function saveSubjectReliabilityScore(input) {
  return saveSubject.execute(input);
}

async function getSubjectReliabilityScore(input) {
  return getSubject.execute(input);
}

module.exports = {
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
