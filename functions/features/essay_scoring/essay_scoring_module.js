/**
 * Essay Scoring feature APIs, mirrored in backend and web.
 *
 * scoreEssay({questionId, answer}) -> Promise<{score, corrections}>
 *   Loads the saved essay question and grades with the LLM. Does not write results.
 * saveEssayResult({studentId, questionId, answer, score, corrections}) -> Promise<EssayResult>
 *   Validates that the essay question exists and atomically replaces the current result.
 * getEssayResult({studentId, questionId}) -> Promise<EssayResult|null>
 *
 * Storage: essayResults/{studentId}/questions/{questionId}.
 * One result per student and question; saving again replaces the earlier result.
 * EssayResult: {studentId, questionId, answer, score, corrections, scoredAt}.
 * score: finite number 0-100. corrections: [{originalText, correctedText, explanation}].
 * originalText is an exact nonempty excerpt from answer; correctedText may be empty for deletion.
 * The exact submitted answer is retained. scoredAt is a server timestamp, returned as a Date.
 * Question text, level, grade, language, difficulty and word-count requirement come from
 * the Essay Question Generator feature; callers cannot override them for scoring.
 * No dependency on Student Practice or Student Essay Practice and no new Firebase endpoints.
 * Web APIs require sign-in and check that the signed-in account has not changed.
 */

const {getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {generateLlmText} = require("../../utils/llm/llm_ops");
const {ScoreEssay} = require("./application/score_essay");
const {SaveEssayResult} = require("./application/save_essay_result");
const {GetEssayResult} = require("./application/get_essay_result");
const {FirestoreEssayResultRepository} = require("./infrastructure/firestore_essay_result_repository");

const repository = new FirestoreEssayResultRepository();
const scoring = new ScoreEssay({
  getEssayQuestionById,
  generateLlmText: generateLlmText,
});
const saveResult = new SaveEssayResult({repository, getEssayQuestionById});
const getResult = new GetEssayResult(repository);

async function scoreEssay(input) {
  return scoring.execute(input);
}

async function saveEssayResult(input) {
  return saveResult.execute(input);
}

async function getEssayResult(input) {
  return getResult.execute(input);
}

module.exports = {scoreEssay, saveEssayResult, getEssayResult};

