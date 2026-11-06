/**
 * Topic framework APIs (feature APIs; no Firebase callable endpoints).
 * getTopicAssessmentFrameworkId({syllabusId, topicId, language}) -> string|null.
 * Resolves only the topic/language assignment; there is no syllabus default.
 * assignTopicAssessmentFramework({syllabusId, topicId, language, assessmentFrameworkId})
 * saves a reference; null clears a draft topic without an attached practice.
 * Framework type determines the topic question type. Web binding writes require a site administrator.
 */
const {getAssessmentFrameworkById} = require("../assessment_framework/assessment_framework_module");
const {resolveTopicAssessmentFrameworkId} = require("./domain/syllabus");
const {AssignTopicAssessmentFramework, GetTopicAssessmentFrameworkId} = require("./application/topic_assessment_framework");
const {preAssessmentPracticeTypes} = require("../../schema/syllabuses_schema");
const {AssignTopicPreAssessmentPractice} = require("./application/assign_topic_pre_assessment_practice");
const {
  FirestoreSyllabusRepository,
} = require("./infrastructure/firestore_syllabus_repository");
const { GetSyllabus } = require("./application/get_syllabus");
const { ListSyllabuses } = require("./application/list_syllabuses");
const { IsTopicPausable } = require("./application/is_topic_pausable");

const syllabusRepository = new FirestoreSyllabusRepository();
const topicFrameworkReader = new GetTopicAssessmentFrameworkId(syllabusRepository);
const topicFrameworkWriter = new AssignTopicAssessmentFramework({repository: syllabusRepository, getAssessmentFrameworkById});
async function getTopicAssessmentFrameworkId(input) {return topicFrameworkReader.execute(input);}
async function assignTopicAssessmentFramework(input, context) {
  return topicFrameworkWriter.execute(input, context);
}

const assignTopicPreAssessmentPracticeUseCase = new AssignTopicPreAssessmentPractice(syllabusRepository, {getAssessmentFrameworkById});
const isTopicPausableUseCase = new IsTopicPausable(syllabusRepository);
const getSyllabus = new GetSyllabus(syllabusRepository);
const listSyllabusesUseCase = new ListSyllabuses(syllabusRepository);

async function getSyllabusById(syllabusId) {
  return getSyllabus.execute(syllabusId);
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

/**
 * Attaches one practice per topic/language. practiceType is normal|essay|fillInTheBlanks; omitted means normal.
 * practiceId references practices/{id} or essayPractices/{id} according to that type.
 */
async function assignTopicPreAssessmentPractice(syllabusId, topicId, language, practiceId,
  practiceType = preAssessmentPracticeTypes.NORMAL, options) {
  return assignTopicPreAssessmentPracticeUseCase.execute(syllabusId, topicId, language, practiceId, practiceType, options);
}

module.exports = {
  assignTopicAssessmentFramework, getTopicAssessmentFrameworkId, resolveTopicAssessmentFrameworkId,
  preAssessmentPracticeTypes,
  assignTopicPreAssessmentPractice,
  getSyllabusById,
  isTopicPausable,
  listSyllabuses,
};
