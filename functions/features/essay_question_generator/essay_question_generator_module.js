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
 * saveEssayQuestion(draft, context) -> Promise<EssayQuestion>
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

const {ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES} = require("../../schema/essay_question_generator_schema");
const {createDefaultConfiguration, requireAdministratorUid} = require("./domain/essay_question_generator_config");
const {FirestoreEssayQuestionGeneratorRepository} = require("./infrastructure/firestore_essay_question_generator_repository");
const {GetEssayQuestionGeneratorConfig} = require("./application/get_essay_question_generator_config");
const {SaveEssayQuestionGeneratorConfig} = require("./application/save_essay_question_generator_config");
const {GenerateEssayQuestion} = require("./application/generate_essay_question");
const {SaveEssayQuestion} = require("./application/save_essay_question");
const {GetEssayQuestionById} = require("./application/get_essay_question_by_id");
const {ListEssayQuestions} = require("./application/list_essay_questions");
const {GetRandomEssayQuestion} = require("./application/get_random_essay_question");
const {generateLlmText} = require("../../utils/llm/llm_ops");

const requireAdministrator = context => ({uid: requireAdministratorUid(context?.updatedBy)});
const generateEssayLlmText = generateLlmText;

const repository = new FirestoreEssayQuestionGeneratorRepository();
const getConfig = new GetEssayQuestionGeneratorConfig(repository);
const saveConfig = new SaveEssayQuestionGeneratorConfig(repository, requireAdministrator);
const generateQuestion = new GenerateEssayQuestion({repository, requireAdministrator, generateLlmText: generateEssayLlmText});
const saveQuestion = new SaveEssayQuestion(repository, requireAdministrator);
const getQuestion = new GetEssayQuestionById(repository);
const listQuestions = new ListEssayQuestions(repository);
const getRandomQuestion = new GetRandomEssayQuestion(repository);

async function getEssayQuestionGeneratorConfig() {return getConfig.execute();}
async function saveEssayQuestionGeneratorConfig(input, context) {return saveConfig.execute(input, context);}
async function generateEssayQuestion(input, context) {return generateQuestion.execute(input, context);}
async function saveEssayQuestion(input, context) {return saveQuestion.execute(input, context);}
async function getEssayQuestionById(questionId) {return getQuestion.execute(questionId);}
async function listEssayQuestions(input) {return listQuestions.execute(input);}
async function getRandomEssayQuestion(input) {return getRandomQuestion.execute(input);}

module.exports = {ESSAY_QUESTION_LEVELS, ESSAY_QUESTION_STANDARDS, ESSAY_QUESTION_DIFFICULTIES, createDefaultConfiguration, getEssayQuestionGeneratorConfig, saveEssayQuestionGeneratorConfig, generateEssayQuestion, saveEssayQuestion, getEssayQuestionById, listEssayQuestions, getRandomEssayQuestion};
