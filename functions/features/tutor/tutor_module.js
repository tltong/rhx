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
 * getTutorMiniQuestionSet({questionId, language, miniQuestionCount?})
 *   -> Promise<TutorMiniQuestionSet & {guideId: string}>
 * Both operations ensure an immutable shared guide exists. They authorize the
 * source question and current topic setting, then load saved TutorConfig even
 * for an explicit count. Identical complete model inputs share a content version
 * across bank questions, students and frozen assessment questions. Instruction
 * text and the prompt template select the instruction version; language/count
 * select variants. Feedback-only edits do not invalidate generation.
 * Legacy unversioned guides are preserved; their unknown content versions are
 * never promoted to the shared cache. Read/corruption failures never regenerate.
 * Simultaneous misses may generate twice; create-only storage returns the same
 * winning guide to both callers without replacing a guide already being used.
 * Disabled topics reject with code tutor-disabled before any cache/model work.
 *
 * checkTutorMiniQuestionAnswer({questionId, guideId?, language, miniQuestionCount,
 *   sequence, answer}) -> Promise<{isCorrect: boolean}>
 * The review page passes the selected guideId so instruction edits cannot switch
 * its answers. Source access and content version are checked again. Omitting
 * guideId selects the current instruction version for programmatic callers.
 * Checks never generate sets, store answers or record student identity.
 *
 * TutorMiniQuestionSet response: {questionId: caller's source ID, guideId,
 *   language, miniQuestionCount, miniQuestions: [{sequence, questionText,
 *   expectedAnswer, acceptedAnswers, answerExplanation}],
 *   configUpdatedAt: Date, generatedAt: Date}.
 * Stored in tutor/{guideId}/counts/{miniQuestionCount}/languages/{encodedLanguage}
 * with questionId = guideId. The shared key contains SHA-256 hashes of canonical
 * question content and generation instructions/template. Student identity,
 * original question content and responses are not stored with the guide.
 */
/** Configuration writes require trusted backend context {updatedBy: administratorUid}. */
const {DEFAULT_TUTOR_MINI_QUESTION_COUNT} = require("../../schema/tutor_schema");
const {FirestoreTutorConfigRepository} = require("./infrastructure/firestore_tutor_config_repository");
const {GetTutorConfig} = require("./application/get_tutor_config");
const {SaveTutorConfig} = require("./application/save_tutor_config");
const {requireAdministratorUid} = require("./domain/tutor_config");
const {FirestoreTutorMiniQuestionSetRepository} = require("./infrastructure/firestore_tutor_mini_question_set_repository");
const {SharedTutorReview} = require("./application/shared_tutor_review");
const {getQuestionById} = require("../question/question_module");
const {getPreAssessmentQuestionById} = require("../pre_assessment_question/pre_assessment_question_module");
const {GetTutorQuestionById} = require("./application/get_tutor_question_by_id");
const {generateLlmText} = require("../../utils/llm/llm_ops");
const {isTopicTutorEnabled} = require("../syllabus/syllabus_module");

const repository = new FirestoreTutorConfigRepository();
const getConfig = new GetTutorConfig(repository);
const saveConfig = new SaveTutorConfig(repository, context => ({
  uid: requireAdministratorUid(context?.updatedBy),
}));
const setRepository = new FirestoreTutorMiniQuestionSetRepository();
const getSourceQuestion = new GetTutorQuestionById({
  getQuestionById, getPreAssessmentQuestionById, isTopicTutorEnabled,
});


async function getTutorConfig() {
  return getConfig.execute();
}

async function saveTutorConfig(input, context) {
  return saveConfig.execute(input, context);
}

async function generateTutorMiniQuestionSet(input) {return defaultReview.generateTutorMiniQuestionSet(input);}
async function getTutorMiniQuestionSet(input) {return defaultReview.getTutorMiniQuestionSet(input);}
async function checkTutorMiniQuestionAnswer(input) {return defaultReview.checkTutorMiniQuestionAnswer(input);}

async function getTutorQuestionById(questionId) {
  return getSourceQuestion.execute(questionId);
}

function createTutorReviewForQuestion(loadQuestion) {
  if (typeof loadQuestion !== "function") throw new Error("A tutor question loader is required.");
  const question = async questionId => {
    const source = await loadQuestion(questionId);
    if (!source) throw new Error("Question " + questionId + " was not found.");
    if (source.id !== questionId) throw new Error("The tutor question does not match this review.");
    return source;
  };
  const review = new SharedTutorReview({getQuestionById: question, getTutorConfig,
    generateLlmText: generateLlmText, repository: setRepository});
  return {
    getTutorQuestionById: question,
    generateTutorMiniQuestionSet: input => review.get(input),
    getTutorMiniQuestionSet: input => review.get(input),
    checkTutorMiniQuestionAnswer: input => review.check(input),
  };
}
const defaultReview = createTutorReviewForQuestion(getTutorQuestionById);

module.exports = {
  DEFAULT_TUTOR_MINI_QUESTION_COUNT, getTutorConfig, saveTutorConfig,
  generateTutorMiniQuestionSet, getTutorMiniQuestionSet,
  checkTutorMiniQuestionAnswer,
  getTutorQuestionById,
  createTutorReviewForQuestion,
};

