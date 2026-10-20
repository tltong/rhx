/**
 * Essay Scoring feature APIs, mirrored in backend and web.
 *
 * scoreEssay({questionId, answer}) -> Promise<{score, reviewComment, corrections}>
 *   Loads the saved essay question and grades with the LLM. Does not write results.
 * saveEssayResult({studentId, questionId, answer, score, reviewComment, corrections}) -> Promise<EssayResult>
 *   Validates that the essay question exists and atomically replaces the current result.
 * getEssayResult({studentId, questionId}) -> Promise<EssayResult|null>
 *
 * Storage: essayResults/{studentId}/questions/{questionId}.
 * One result per student and question; saving again replaces the earlier result.
 * EssayResult: {studentId, questionId, answer, score, reviewComment, corrections, scoredAt}.
 * reviewComment: nonempty overall feedback on strengths and improvements, in the question's language.
 * Required for new assessments and saves; legacy reads may omit reviewComment.
 * score: finite number 0-100. corrections: [{originalText, correctedText, explanation}].
 * originalText is an exact nonempty excerpt from answer; correctedText may be empty for deletion.
 * The exact submitted answer is retained. scoredAt is a server timestamp, returned as a Date.
 * Question text, level, grade, language, difficulty and word-count requirement come from
 * the Essay Question Generator feature; callers cannot override them for scoring.
 * No dependency on Student Practice or Student Essay Practice and no new Firebase endpoints.
 * Web APIs require sign-in and check that the signed-in account has not changed.
 * getEssayScoringConfig() -> Promise<EssayScoringConfig|null>; missing config uses code defaults without writes.
 * saveEssayScoringConfig({markingInstructions, additionalLlmInstructions, gradeInstructions}) -> Promise<EssayScoringConfig>.
 *   Verified site administrators may replace essayScoring/config; metadata is server-controlled.
 * Scoring combines saved base, global and question-level/grade instructions with fixed response rules.
 * Changes affect future marking; existing results are not automatically remarked.
 */

import {getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {generateLlmText} from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {ScoreEssay} from "./application/score_essay.js?v=20261020-scoring-config-v1";
import {ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES} from "../../config/firebase/essay_scoring_schema.js?v=20261020-scoring-config-v1";
import {createDefaultConfiguration} from "./domain/essay_scoring_config.js?v=20261020-scoring-config-v1";
import {FirestoreEssayScoringConfigRepository} from "./infrastructure/firestore_essay_scoring_config_repository.js?v=20261020-scoring-config-v1";
import {GetEssayScoringConfig} from "./application/get_essay_scoring_config.js?v=20261020-scoring-config-v1";
import {SaveEssayScoringConfig} from "./application/save_essay_scoring_config.js?v=20261020-scoring-config-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {SaveEssayResult} from "./application/save_essay_result.js?v=20261018-essay-review-comment-v1";
import {GetEssayResult} from "./application/get_essay_result.js?v=20261018-essay-review-comment-v1";
import {FirestoreEssayResultRepository} from "./infrastructure/firestore_essay_result_repository.js?v=20261018-essay-review-comment-v1";

async function withCurrentAccount(operation) {
  const user = requireCurrentFirebaseAuthUser();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) {
      throw new Error("The signed-in account changed. Try again.");
    }
  };
  const result = await operation({assertAccess});
  assertAccess();
  return result;
}

const repository = new FirestoreEssayResultRepository();
const configRepository = new FirestoreEssayScoringConfigRepository();
const getConfig = new GetEssayScoringConfig(configRepository);
async function requireAdministrator() {
  return withCurrentAccount(async ({assertAccess}) => {
    const user = requireCurrentFirebaseAuthUser();
    const status = await requireCurrentSiteAdmin();
    assertAccess();
    if (!user.emailVerified || user.email?.trim().toLowerCase() !== status.email) {
      throw new Error("The signed-in administrator account changed. Try again.");
    }
    return {uid: user.uid, assertAccess};
  });
}
const saveConfig = new SaveEssayScoringConfig(configRepository, requireAdministrator);
const scoring = new ScoreEssay({
  getEssayQuestionById,
  getEssayScoringConfig: () => getConfig.execute(),
  generateLlmText: (prompt, options) => generateLlmText(prompt, {...options, useDirectFunction: true}),
});
const saveResult = new SaveEssayResult({repository, getEssayQuestionById});
const getResult = new GetEssayResult(repository);

async function scoreEssay(input) {
  return withCurrentAccount(context => scoring.execute(input, context));
}

async function saveEssayResult(input) {
  return withCurrentAccount(context => saveResult.execute(input, context));
}

async function getEssayResult(input) {
  return withCurrentAccount(context => getResult.execute(input, context));
}

async function getEssayScoringConfig() {return withCurrentAccount(() => getConfig.execute());}
async function saveEssayScoringConfig(input) {
  requireCurrentFirebaseAuthUser();
  return saveConfig.execute(input);
}

export {scoreEssay, saveEssayResult, getEssayResult, getEssayScoringConfig, saveEssayScoringConfig,
  createDefaultConfiguration, ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES};

