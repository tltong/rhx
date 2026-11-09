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
/** Reads and generation require sign-in; configuration writes require a site administrator. */
import {DEFAULT_TUTOR_MINI_QUESTION_COUNT} from "../../config/firebase/tutor_schema.js?v=20261015-tutor-count-variants-v1";
import {FirestoreTutorConfigRepository} from "./infrastructure/firestore_tutor_config_repository.js?v=20261015-tutor-count-variants-v1";
import {GetTutorConfig} from "./application/get_tutor_config.js?v=20261014-tutor-config-v1";
import {SaveTutorConfig} from "./application/save_tutor_config.js?v=20261014-tutor-config-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {FirestoreTutorMiniQuestionSetRepository} from "./infrastructure/firestore_tutor_mini_question_set_repository.js?v=20261109-shared-tutor-v1";
import {SharedTutorReview} from "./application/shared_tutor_review.js?v=20261109-shared-tutor-v1";
import {getQuestionById} from "../question/question_module.js?v=20261015-question-by-id";
import {getPreAssessmentQuestionById} from "../pre_assessment_question/pre_assessment_question_module.js?v=20261015-practice-result-review-v1";
import {GetTutorQuestionById} from "./application/get_tutor_question_by_id.js?v=20261106-topic-tutor-v1";
import {generateLlmText} from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {isTopicTutorEnabled} from "../syllabus/syllabus_module.js?v=20261106-topic-tutor-v1";

const repository = new FirestoreTutorConfigRepository();
const getConfig = new GetTutorConfig(repository);
const saveConfig = new SaveTutorConfig(repository, requireTutorAdministrator);
const setRepository = new FirestoreTutorMiniQuestionSetRepository();
const getSourceQuestion = new GetTutorQuestionById({
  getQuestionById, getPreAssessmentQuestionById, isTopicTutorEnabled,
});
// Tutor generation can exceed Firebase Hosting's 60-second request timeout.
// Use the existing direct HTTP function route for generation and answer checks;
// localhost still resolves to the Functions emulator.
function generateTutorLlmText(input, options) {
  return generateLlmText(input, {...options, useDirectFunction: true});
}


async function requireTutorAdministrator() {
  const user = requireCurrentFirebaseAuthUser();
  const status = await requireCurrentSiteAdmin();
  const currentUser = requireCurrentFirebaseAuthUser();
  if (currentUser.uid !== user.uid
      || currentUser.email?.trim().toLowerCase() !== status.email
      || !currentUser.emailVerified) {
    throw new Error("The signed-in account changed. Try saving again.");
  }
  return currentUser;
}

async function getTutorConfig() {
  requireCurrentFirebaseAuthUser();
  return getConfig.execute();
}

async function saveTutorConfig(input) {
  requireCurrentFirebaseAuthUser();
  return saveConfig.execute(input);
}

function requireTutorSetAccess() {
  const user = requireCurrentFirebaseAuthUser();
  return () => {
    if (requireCurrentFirebaseAuthUser().uid !== user.uid) {
      throw new Error("The signed-in account changed. Try again.");
    }
  };
}

async function generateTutorMiniQuestionSet(input) {return defaultReview.generateTutorMiniQuestionSet(input);}
async function getTutorMiniQuestionSet(input) {return defaultReview.getTutorMiniQuestionSet(input);}
async function checkTutorMiniQuestionAnswer(input) {return defaultReview.checkTutorMiniQuestionAnswer(input);}

async function getTutorQuestionById(questionId) {
  const assertAccess = requireTutorSetAccess();
  const question = await getSourceQuestion.execute(questionId);
  assertAccess();
  return question;
}

/** Reuse the existing tutor workflow with an authorized frozen-question loader. */
function createTutorReviewForQuestion(loadQuestion) {
  if (typeof loadQuestion !== "function") throw new Error("A tutor question loader is required.");
  const question = async questionId => {
    const assertAccess = requireTutorSetAccess(), source = await loadQuestion(questionId);
    assertAccess();
    if (!source) throw new Error("Question " + questionId + " was not found.");
    if (source.id !== questionId) throw new Error("The tutor question does not match this review.");
    return source;
  };
  const review = new SharedTutorReview({getQuestionById: question, getTutorConfig,
    generateLlmText: generateTutorLlmText, repository: setRepository});
  return {
    getTutorQuestionById: question,
    generateTutorMiniQuestionSet: input => review.get(input, {assertAccess: requireTutorSetAccess()}),
    getTutorMiniQuestionSet: input => review.get(input, {assertAccess: requireTutorSetAccess()}),
    checkTutorMiniQuestionAnswer: input => review.check(input, {assertAccess: requireTutorSetAccess()}),
  };
}
const defaultReview = createTutorReviewForQuestion(getTutorQuestionById);

export {
  DEFAULT_TUTOR_MINI_QUESTION_COUNT, getTutorConfig, saveTutorConfig,
  generateTutorMiniQuestionSet, getTutorMiniQuestionSet,
  checkTutorMiniQuestionAnswer,
  getTutorQuestionById,
  createTutorReviewForQuestion,
};

