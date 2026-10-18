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
 */

import {getEssayQuestionById} from "../essay_question_generator/essay_question_generator_module.js?v=20261017-essay-grade-min-words-v1";
import {generateLlmText} from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {ScoreEssay} from "./application/score_essay.js?v=20261018-essay-review-comment-v1";
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
const scoring = new ScoreEssay({
  getEssayQuestionById,
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

export {scoreEssay, saveEssayResult, getEssayResult};

