/**
 * Internal feature APIs; no Firebase endpoints.
 *
 * Entry: {value: string, associations: {primary?: number[], secondary?: number[]}}.
 * Grades are unique integers 1-6; unknown levels are rejected. {} is unassigned.
 *
 * getQuestionSeedGeneratorConfig() -> Promise<QuestionSeedGeneratorConfig|null>
 * saveQuestionSeedGeneratorConfig({generationSeed, additionalLlmInstructions}, context)
 *   -> Promise<QuestionSeedGeneratorConfig>
 * getQuestionSeedEntries({vertical, level?, grade?}) -> Promise<Entry[]>
 *   Supply level/grade together, or omit both to list all entries for administration.
 * saveQuestionSeedEntry({vertical, entry}, context) -> Promise<Entry>
 *   Atomic upsert by normalized value; replaces that entry's associations and
 *   preserves its existing display value and all other entries.
 * saveQuestionSeedEntries({vertical, entries}, context) -> Promise<Entry[]>
 *   Explicit replacement of one complete list, including unassigned entries.
 * removeQuestionSeedEntries({vertical, entries: string[]}, context) -> Promise<Entry[]>
 *   Atomic removal by value, preserving concurrent additions.
 * generateQuestionSeedEntry({vertical, associations?, seed?, save?, useHighLevelSeed?}, context)
 *   -> Promise<Entry>
 *   Omitting associations generates an unassigned entry, ready for tagging after generation.
 *   Explicit associations remain supported for backend callers requesting targeted generation.
 *   All existing values are passed for duplicate avoidance, across associations.
 *   save defaults to true; false previews without writing. Duplicate responses
 *   retry at most three times. Associations come from the caller, not the LLM.
 *   useHighLevelSeed defaults to true. false omits all seed fallbacks; otherwise
 *   nonblank request seed -> configured generationSeed -> "latest news".
 * getRandomQuestionSeedEntry({vertical, level, grade}) -> Promise<string>
 * getCombinedQuestionSeed({level, grade}) -> Promise<string>
 *   Selections exclude unassigned entries and fail clearly on an unmatched pool.
 *   Combined format: "Theme: ...\nSetting: ...\nType: ..."; no LLM call.
 *
 * Reads never write. Legacy string entries are returned as unassigned objects;
 * saving/removing an entry converts that affected list to objects in a transaction.
 * Storage: questionSeedGenerator/{config|theme|setting|type}.
 * Backend writes/generation require trusted {updatedBy: administratorUid}.
 */
const {DEFAULT_QUESTION_GENERATION_SEED, QUESTION_SEED_VERTICALS, QUESTION_SEED_LEVELS, QUESTION_SEED_GRADES} = require("../../schema/question_seed_generator_schema");
const {requireAdministratorUid} = require("./domain/question_seed_generator_config");
const {FirestoreQuestionSeedGeneratorRepository} = require("./infrastructure/firestore_question_seed_generator_repository");
const {GetQuestionSeedGeneratorConfig} = require("./application/get_question_seed_generator_config");
const {SaveQuestionSeedGeneratorConfig} = require("./application/save_question_seed_generator_config");
const {GetQuestionSeedEntries} = require("./application/get_question_seed_entries");
const {SaveQuestionSeedEntries} = require("./application/save_question_seed_entries");
const {SaveQuestionSeedEntry} = require("./application/save_question_seed_entry");
const {RemoveQuestionSeedEntries} = require("./application/remove_question_seed_entries");
const {GenerateQuestionSeedEntry} = require("./application/generate_question_seed_entry");
const {GetRandomQuestionSeedEntry} = require("./application/get_random_question_seed_entry");
const {GetCombinedQuestionSeed} = require("./application/get_combined_question_seed");
const {generateLlmText} = require("../../utils/llm/llm_ops");

const repository = new FirestoreQuestionSeedGeneratorRepository();
const requireAdministrator = context => ({uid: requireAdministratorUid(context?.updatedBy)});
const getConfig = new GetQuestionSeedGeneratorConfig(repository);
const saveConfig = new SaveQuestionSeedGeneratorConfig(repository, requireAdministrator);
const getEntries = new GetQuestionSeedEntries(repository);
const saveEntries = new SaveQuestionSeedEntries(repository, requireAdministrator);
const saveEntry = new SaveQuestionSeedEntry(repository, requireAdministrator);
const removeEntries = new RemoveQuestionSeedEntries(repository, requireAdministrator);
const generateEntry = new GenerateQuestionSeedEntry({repository, requireAdministrator, generateLlmText});
const getRandomEntry = new GetRandomQuestionSeedEntry(repository);
const getCombinedSeed = new GetCombinedQuestionSeed(repository);

async function getQuestionSeedGeneratorConfig() { return getConfig.execute(); }
async function saveQuestionSeedGeneratorConfig(input, context) { return saveConfig.execute(input, context); }
async function getQuestionSeedEntries(input) { return getEntries.execute(input); }
async function saveQuestionSeedEntries(input, context) { return saveEntries.execute(input, context); }
async function saveQuestionSeedEntry(input, context) { return saveEntry.execute(input, context); }
async function removeQuestionSeedEntries(input, context) { return removeEntries.execute(input, context); }
async function generateQuestionSeedEntry(input, context) { return generateEntry.execute(input, context); }
async function getRandomQuestionSeedEntry(input) { return getRandomEntry.execute(input); }
async function getCombinedQuestionSeed(input) { return getCombinedSeed.execute(input); }

module.exports = {
  DEFAULT_QUESTION_GENERATION_SEED, QUESTION_SEED_VERTICALS, QUESTION_SEED_LEVELS, QUESTION_SEED_GRADES,
  getQuestionSeedGeneratorConfig, saveQuestionSeedGeneratorConfig,
  getQuestionSeedEntries, saveQuestionSeedEntries, saveQuestionSeedEntry, removeQuestionSeedEntries, generateQuestionSeedEntry,
  getRandomQuestionSeedEntry, getCombinedQuestionSeed,
};
