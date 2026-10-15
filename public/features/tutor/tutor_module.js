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
 * generateTutorMiniQuestionSet({questionId, language})
 *   -> Promise<TutorMiniQuestionSet>
 * Loads the complete Question (including SVG) and saved TutorConfig, builds
 * the fixed prompt, calls the existing LLM utility, validates and saves the set.
 * The requested language must have feedback configured. Each generation
 * replaces only that question/language set; malformed responses never write.
 *
 * getTutorMiniQuestionSet({questionId, language})
 *   -> Promise<TutorMiniQuestionSet>
 * Reads and returns the saved set first. If none exists, generates, validates,
 * saves and returns a new set through the existing generation workflow.
 * Saved sets are reused without reading the source question or configuration.
 * Read failures and corrupt saved data propagate without triggering generation.
 *
 * checkTutorMiniQuestionAnswer({questionId, language, sequence, answer})
 *   -> Promise<{isCorrect: boolean}>
 * Checks an already saved mini question. Normalized expected/accepted answers
 * pass locally; other wording is judged by the existing LLM utility.
 * Checks never generate sets, store answers or record student identity.
 *
 * TutorMiniQuestionSet: {questionId, language, miniQuestionCount,
 *   miniQuestions: [{sequence, questionText, expectedAnswer,
 *     acceptedAnswers: string[], answerExplanation}],
 *   configUpdatedAt: Date, generatedAt: Date}.
 * Stored in tutor/set-[SHA-256 of the question ID and language].
 * No student identity, original question content or invocation history is saved.
 */
/** Reads and generation require sign-in; configuration writes require a site administrator. */
import {DEFAULT_TUTOR_MINI_QUESTION_COUNT} from "../../config/firebase/tutor_schema.js?v=20261014-tutor-config-v1";
import {FirestoreTutorConfigRepository} from "./infrastructure/firestore_tutor_config_repository.js?v=20261014-tutor-config-v1";
import {GetTutorConfig} from "./application/get_tutor_config.js?v=20261014-tutor-config-v1";
import {SaveTutorConfig} from "./application/save_tutor_config.js?v=20261014-tutor-config-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {FirestoreTutorMiniQuestionSetRepository} from "./infrastructure/firestore_tutor_mini_question_set_repository.js?v=20261015-tutor-generation-v1";
import {GenerateTutorMiniQuestionSet} from "./application/generate_tutor_mini_question_set.js?v=20261015-tutor-simple-answers-v1";
import {GetTutorMiniQuestionSet} from "./application/get_tutor_mini_question_set.js?v=20261015-tutor-get-or-generate-v1";
import {getQuestionById} from "../question/question_module.js?v=20261015-question-by-id";
import {getPreAssessmentQuestionById} from "../pre_assessment_question/pre_assessment_question_module.js?v=20261015-practice-result-review-v1";
import {GetTutorQuestionById} from "./application/get_tutor_question_by_id.js?v=20261015-practice-result-review-v1";
import {generateLlmText} from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {CheckTutorMiniQuestionAnswer} from "./application/check_tutor_mini_question_answer.js?v=20261015-question-review-v1";

const repository = new FirestoreTutorConfigRepository();
const getConfig = new GetTutorConfig(repository);
const saveConfig = new SaveTutorConfig(repository, requireTutorAdministrator);
const setRepository = new FirestoreTutorMiniQuestionSetRepository();
const getSourceQuestion = new GetTutorQuestionById({
  getQuestionById, getPreAssessmentQuestionById,
});
// Tutor generation can exceed Firebase Hosting's 60-second request timeout.
// Use the existing direct HTTP function route for generation and answer checks;
// localhost still resolves to the Functions emulator.
function generateTutorLlmText(input, options) {
  return generateLlmText(input, {...options, useDirectFunction: true});
}
const generateSet = new GenerateTutorMiniQuestionSet({
  getQuestionById: getTutorQuestionById, getTutorConfig,
  generateLlmText: generateTutorLlmText, repository: setRepository,
});
const getSet = new GetTutorMiniQuestionSet(
  setRepository, (input, options) => generateSet.execute(input, options),
);
const checkAnswer = new CheckTutorMiniQuestionAnswer({
  repository: setRepository, generateLlmText: generateTutorLlmText,
});

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

async function generateTutorMiniQuestionSet(input) {
  return generateSet.execute(input, {assertAccess: requireTutorSetAccess()});
}

async function getTutorMiniQuestionSet(input) {
  return getSet.execute(input, {assertAccess: requireTutorSetAccess()});
}

async function checkTutorMiniQuestionAnswer(input) {
  return checkAnswer.execute(input, {assertAccess: requireTutorSetAccess()});
}

async function getTutorQuestionById(questionId) {
  const assertAccess = requireTutorSetAccess();
  const question = await getSourceQuestion.execute(questionId);
  assertAccess();
  return question;
}

export {
  DEFAULT_TUTOR_MINI_QUESTION_COUNT, getTutorConfig, saveTutorConfig,
  generateTutorMiniQuestionSet, getTutorMiniQuestionSet,
  checkTutorMiniQuestionAnswer,
  getTutorQuestionById,
};

