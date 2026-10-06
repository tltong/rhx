const {
  FirestoreSyllabusRepository,
} = require("./infrastructure/firestore_syllabus_repository");
const { GetSyllabus } = require("./application/get_syllabus");
const {
  GetSyllabusAssessmentFrameworkId,
} = require("./application/get_syllabus_assessment_framework_id");
const { ListSyllabuses } = require("./application/list_syllabuses");
const { IsTopicPausable } = require("./application/is_topic_pausable");

const syllabusRepository = new FirestoreSyllabusRepository();
const isTopicPausableUseCase = new IsTopicPausable(syllabusRepository);
const getSyllabus = new GetSyllabus(syllabusRepository);
const getSyllabusAssessmentFrameworkIdUseCase =
  new GetSyllabusAssessmentFrameworkId(syllabusRepository);
const listSyllabusesUseCase = new ListSyllabuses(syllabusRepository);

async function getSyllabusById(syllabusId) {
  return getSyllabus.execute(syllabusId);
}

/**
 * @param {string} syllabusId
 * @returns {Promise<string>} The attached assessment framework ID.
 */
async function getSyllabusAssessmentFrameworkId(syllabusId) {
  return getSyllabusAssessmentFrameworkIdUseCase.execute(syllabusId);
}

/**
 * @param {string} syllabusId
 * @param {string} topicId
 * @returns {Promise<boolean>} Missing pausable fields default to true.
 */
async function isTopicPausable(syllabusId, topicId) {
  return isTopicPausableUseCase.execute(syllabusId, topicId);
}

async function listSyllabuses() {
  return listSyllabusesUseCase.execute();
}

module.exports = {
  getSyllabusAssessmentFrameworkId,
  getSyllabusById,
  isTopicPausable,
  listSyllabuses,
};
