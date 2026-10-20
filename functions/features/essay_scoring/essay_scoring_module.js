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
 * saveEssayScoringConfig({markingInstructions, additionalLlmInstructions, gradeInstructions}, {updatedBy}) -> Promise<EssayScoringConfig>.
 *   Trusted administrator callers may replace essayScoring/config; metadata is server-controlled.
 * Scoring combines saved base, global and question-level/grade instructions with fixed response rules.
 * Changes affect future marking; existing results are not automatically remarked.
 */

const {getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {generateLlmText} = require("../../utils/llm/llm_ops");
const {ScoreEssay} = require("./application/score_essay");
const {SaveEssayResult} = require("./application/save_essay_result");
const {GetEssayResult} = require("./application/get_essay_result");
const {FirestoreEssayResultRepository} = require("./infrastructure/firestore_essay_result_repository");
const {ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES} = require("../../schema/essay_scoring_schema");
const {createDefaultConfiguration, requireAdministratorUid} = require("./domain/essay_scoring_config");
const {FirestoreEssayScoringConfigRepository} = require("./infrastructure/firestore_essay_scoring_config_repository");
const {GetEssayScoringConfig} = require("./application/get_essay_scoring_config");
const {SaveEssayScoringConfig} = require("./application/save_essay_scoring_config");

const repository = new FirestoreEssayResultRepository();
const configRepository = new FirestoreEssayScoringConfigRepository();
const getConfig = new GetEssayScoringConfig(configRepository);
const saveConfig = new SaveEssayScoringConfig(configRepository, async context => ({uid: requireAdministratorUid(context?.updatedBy)}));
const scoring = new ScoreEssay({
  getEssayQuestionById,
  getEssayScoringConfig: () => getConfig.execute(),
  generateLlmText: generateLlmText,
});
const saveResult = new SaveEssayResult({repository, getEssayQuestionById});
const getResult = new GetEssayResult(repository);

async function scoreEssay(input) {
  return scoring.execute(input);
}

async function saveEssayResult(input, context) {
  return saveResult.execute(input, context);
}

async function getEssayResult(input) {
  return getResult.execute(input);
}

async function getEssayScoringConfig() {return getConfig.execute();}
async function saveEssayScoringConfig(input, context) {return saveConfig.execute(input, context);}

module.exports = {scoreEssay, saveEssayResult, getEssayResult, getEssayScoringConfig, saveEssayScoringConfig,
  createDefaultConfiguration, ESSAY_SCORING_LEVELS, ESSAY_SCORING_GRADES};

