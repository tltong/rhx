/**
 * Feature APIs; none are Firebase callable endpoints.
 *
 * getTutorQuestionById(questionId) -> Promise<Question|PreAssessmentQuestion|null>
 * Resolves the full original question from either question feature, including
 * answers, explanation and SVG. IDs found in both sources are rejected.
 *
 * getTutorConfig() -> Promise<TutorConfig|null>
 * Returns null when unsaved; reads never create configuration.
 *
 * saveTutorConfig({miniQuestionCount, promptInstructions,
 *   correctAnswerMessage, incorrectAnswerMessage}) -> Promise<TutorConfig>
 * Replaces the complete configuration at tutor/config without revision history.
 * miniQuestionCount is a positive safe integer. promptInstructions is a string
 * and may be empty. Both message maps contain the same nonempty language keys
 * with nonempty string messages. Language keys are dynamic and preserved.
 * Caller-supplied metadata is ignored; updatedAt is assigned by Firestore.
 *
 * TutorConfig: {miniQuestionCount, promptInstructions, correctAnswerMessage,
 *   incorrectAnswerMessage, updatedAt: Date, updatedBy: administrator UID}.
 * DEFAULT_TUTOR_MINI_QUESTION_COUNT is 3; using it never persists defaults.
 *
 * generateTutorMiniQuestionSet({questionId, language, miniQuestionCount?})
 *   -> Promise<TutorMiniQuestionSet>
 * Loads the complete Question (including SVG) and saved TutorConfig, builds
 * the fixed prompt, calls the existing LLM utility, validates and saves the set.
 * The requested language must have feedback configured. Each generation
 * replaces only that question/count/language set; malformed responses never write.
 * An omitted count is resolved from configuration; an explicit count overrides it.
 *
 * getTutorMiniQuestionSet({questionId, language, miniQuestionCount?})
 *   -> Promise<TutorMiniQuestionSet>
 * Reads and returns the saved set first. If none exists, generates, validates,
 * saves and returns a new set through the existing generation workflow.
 * An omitted count is read from configuration once before selecting the set.
 * With an explicit count, cached sets require no source question or config reads.
 * Matching legacy sets are copied to the new path on access, preserving timestamps.
 * Read failures and corrupt saved data propagate without triggering generation.
 *
 * checkTutorMiniQuestionAnswer({questionId, language, miniQuestionCount, sequence, answer})
 *   -> Promise<{isCorrect: boolean}>
 * Checks an already saved mini question. Normalized expected/accepted answers
 * pass locally; other wording is judged by the existing LLM utility.
 * Checks never generate sets, store answers or record student identity.
 *
 * TutorMiniQuestionSet: {questionId, language, miniQuestionCount,
 *   miniQuestions: [{sequence, questionText, expectedAnswer,
 *     acceptedAnswers: string[], answerExplanation}],
 *   configUpdatedAt: Date, generatedAt: Date}.
 * Stored in tutor/{questionId}/counts/{miniQuestionCount}/languages/{encodedLanguage}.
 * No student identity, original question content or invocation history is saved.
 */
/** Configuration writes require trusted backend context {updatedBy: administratorUid}. */
const {DEFAULT_TUTOR_MINI_QUESTION_COUNT} = require("../../schema/tutor_schema");
const {FirestoreTutorConfigRepository} = require("./infrastructure/firestore_tutor_config_repository");
const {GetTutorConfig} = require("./application/get_tutor_config");
const {SaveTutorConfig} = require("./application/save_tutor_config");
const {requireAdministratorUid} = require("./domain/tutor_config");
const {FirestoreTutorMiniQuestionSetRepository} = require("./infrastructure/firestore_tutor_mini_question_set_repository");
const {GenerateTutorMiniQuestionSet} = require("./application/generate_tutor_mini_question_set");
const {GetTutorMiniQuestionSet} = require("./application/get_tutor_mini_question_set");
const {getQuestionById} = require("../question/question_module");
const {getPreAssessmentQuestionById} = require("../pre_assessment_question/pre_assessment_question_module");
const {GetTutorQuestionById} = require("./application/get_tutor_question_by_id");
const {generateLlmText} = require("../../utils/llm/llm_ops");
const {CheckTutorMiniQuestionAnswer} = require("./application/check_tutor_mini_question_answer");

const repository = new FirestoreTutorConfigRepository();
const getConfig = new GetTutorConfig(repository);
const saveConfig = new SaveTutorConfig(repository, context => ({
  uid: requireAdministratorUid(context?.updatedBy),
}));
const setRepository = new FirestoreTutorMiniQuestionSetRepository();
const getSourceQuestion = new GetTutorQuestionById({
  getQuestionById, getPreAssessmentQuestionById,
});
const generateSet = new GenerateTutorMiniQuestionSet({
  getQuestionById: getTutorQuestionById, getTutorConfig, generateLlmText, repository: setRepository,
});
const getSet = new GetTutorMiniQuestionSet(
  setRepository, (input, options) => generateSet.execute(input, options), getTutorConfig,
);
const checkAnswer = new CheckTutorMiniQuestionAnswer({
  repository: setRepository, generateLlmText,
});

async function getTutorConfig() {
  return getConfig.execute();
}

async function saveTutorConfig(input, context) {
  return saveConfig.execute(input, context);
}

async function generateTutorMiniQuestionSet(input) {
  return generateSet.execute(input);
}

async function getTutorMiniQuestionSet(input) {
  return getSet.execute(input);
}

async function checkTutorMiniQuestionAnswer(input) {
  return checkAnswer.execute(input);
}

async function getTutorQuestionById(questionId) {
  return getSourceQuestion.execute(questionId);
}

module.exports = {
  DEFAULT_TUTOR_MINI_QUESTION_COUNT, getTutorConfig, saveTutorConfig,
  generateTutorMiniQuestionSet, getTutorMiniQuestionSet,
  checkTutorMiniQuestionAnswer,
  getTutorQuestionById,
};

