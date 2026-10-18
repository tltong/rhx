/**
 * Essay Question Generator feature APIs, mirrored in backend and web.
 * No new Firebase endpoints and no dependency on Question Seed Generator.
 *
 * getEssayQuestionGeneratorConfig() -> Promise<Config|null>
 * saveEssayQuestionGeneratorConfig({additionalLlmInstructions, gradeInstructions, difficultyInstructions, gradeWordCountRequirements})
 *   -> Promise<Config>. Replaces the complete config; missing instructions default to "", minimums to null.
 *   gradeWordCountRequirements: {primary: {"1".."6": {minWords}}, secondary: {"1".."6": {minWords}}}.
 * generateEssayQuestion({level, standard, language, difficulty, seed, save?}) -> Promise<EssayQuestion|EssayQuestionDraft>
 *   Uses the caller's nonempty seed and selected common/grade/difficulty instructions.
 *   Passes the selected grade's minWords directly to the LLM; free-text word counts are ignored.
 *   save defaults to true. false returns a draft with an allocated questionId and no writes.
 * saveEssayQuestion(draft) -> Promise<EssayQuestion>
 *   Saves the draft and lookup atomically. Retrying an identical draft does not duplicate it.
 *   Draft: {questionId, level, standard, language, difficulty, questionText, seedUsed, wordCountRequirement}.
 *   wordCountRequirement: {minWords: positive safe integer|null}; retained from generation, not recomputed on save.
 * getEssayQuestionById(questionId) -> Promise<EssayQuestion|null>
 * listEssayQuestions({level, standard, language, difficulty?, limit, cursor?})
 *   -> Promise<{questions: EssayQuestion[], nextCursor: string|null}>
 *   Stable ascending question-ID order; reuse nextCursor with the same search criteria.
 * getRandomEssayQuestion({level, standard, language, difficulty?}) -> Promise<EssayQuestion|null>
 *   Uniform reservoir sampling scans all matches in bounded pages.
 *
 * level: primary|secondary; standard: integer 1-6; difficulty: easy|medium|hard.
 * EssayQuestion: {questionId, level, standard, language, difficulty, questionText, seedUsed, wordCountRequirement, generatedAt}.
 * Config: common instructions + primary/secondary grades 1-6 + easy/medium/hard instructions,
 *   updatedAt and updatedBy. Defaults are read-only until explicitly saved.
 * Older configs, drafts and questions without word-count fields read as minWords: null without writes.
 * Backend mutations/generation additionally require trusted {updatedBy: administratorUid}.
 * Web reads require sign-in; mutations/generation require a verified site administrator.
 */

import {ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES} from "../../config/firebase/essay_question_generator_schema.js?v=20261017-essay-grade-min-words-v1";
import {createDefaultConfiguration} from "./domain/essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";
import {FirestoreEssayQuestionGeneratorRepository} from "./infrastructure/firestore_essay_question_generator_repository.js?v=20261017-essay-grade-min-words-v1";
import {GetEssayQuestionGeneratorConfig} from "./application/get_essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";
import {SaveEssayQuestionGeneratorConfig} from "./application/save_essay_question_generator_config.js?v=20261017-essay-grade-min-words-v1";
import {GenerateEssayQuestion} from "./application/generate_essay_question.js?v=20261017-essay-grade-min-words-v1";
import {SaveEssayQuestion} from "./application/save_essay_question.js?v=20261017-essay-grade-min-words-v1";
import {GetEssayQuestionById} from "./application/get_essay_question_by_id.js?v=20261017-essay-grade-min-words-v1";
import {ListEssayQuestions} from "./application/list_essay_questions.js?v=20261017-essay-grade-min-words-v1";
import {GetRandomEssayQuestion} from "./application/get_random_essay_question.js?v=20261017-essay-grade-min-words-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {generateLlmText} from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";

function currentAccountAccess() {
  const user = requireCurrentFirebaseAuthUser();
  return {user, assertAccess() {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email?.trim().toLowerCase() !== user.email?.trim().toLowerCase()
        || current.emailVerified !== user.emailVerified) {
      throw new Error("The signed-in account changed. Try again.");
    }
  }};
}
async function requireAdministrator() {
  const {user, assertAccess} = currentAccountAccess();
  const status = await requireCurrentSiteAdmin();
  assertAccess();
  if (!user.emailVerified || user.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in administrator account changed. Try again.");
  }
  return {uid: user.uid, assertAccess};
}
const generateEssayLlmText = (prompt, options) => generateLlmText(prompt, {...options, useDirectFunction: true});
async function readWithAccess(operation) {
  const {assertAccess} = currentAccountAccess();
  const result = await operation(assertAccess);
  assertAccess();
  return result;
}

const repository = new FirestoreEssayQuestionGeneratorRepository();
const getConfig = new GetEssayQuestionGeneratorConfig(repository);
const saveConfig = new SaveEssayQuestionGeneratorConfig(repository, requireAdministrator);
const generateQuestion = new GenerateEssayQuestion({repository, requireAdministrator, generateLlmText: generateEssayLlmText});
const saveQuestion = new SaveEssayQuestion(repository, requireAdministrator);
const getQuestion = new GetEssayQuestionById(repository);
const listQuestions = new ListEssayQuestions(repository);
const getRandomQuestion = new GetRandomEssayQuestion(repository);

async function getEssayQuestionGeneratorConfig() {return readWithAccess(() => getConfig.execute());}
async function saveEssayQuestionGeneratorConfig(input) {
  requireCurrentFirebaseAuthUser();
  return saveConfig.execute(input);
}
async function generateEssayQuestion(input) {
  requireCurrentFirebaseAuthUser();
  return generateQuestion.execute(input);
}
async function saveEssayQuestion(input) {
  requireCurrentFirebaseAuthUser();
  return saveQuestion.execute(input);
}
async function getEssayQuestionById(questionId) {return readWithAccess(() => getQuestion.execute(questionId));}
async function listEssayQuestions(input) {return readWithAccess(() => listQuestions.execute(input));}
async function getRandomEssayQuestion(input) {
  return readWithAccess(assertAccess => getRandomQuestion.execute(input, {assertAccess}));
}

export {ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES, createDefaultConfiguration, getEssayQuestionGeneratorConfig, saveEssayQuestionGeneratorConfig, generateEssayQuestion, saveEssayQuestion, getEssayQuestionById, listEssayQuestions, getRandomEssayQuestion};
