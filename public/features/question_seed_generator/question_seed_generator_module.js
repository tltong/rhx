/**
 * Internal feature APIs; no Firebase endpoints.
 *
 * Entry: {value: string, associations: {primary?: number[], secondary?: number[]}}.
 * Grades are unique integers 1-6; unknown levels are rejected. {} is unassigned.
 *
 * getQuestionSeedGeneratorConfig() -> Promise<QuestionSeedGeneratorConfig|null>
 * saveQuestionSeedGeneratorConfig({generationSeed, additionalLlmInstructions})
 *   -> Promise<QuestionSeedGeneratorConfig>
 * getQuestionSeedEntries({vertical, level?, grade?}) -> Promise<Entry[]>
 *   Supply level/grade together, or omit both to list all entries for administration.
 * saveQuestionSeedEntry({vertical, entry}) -> Promise<Entry>
 *   Atomic upsert by normalized value; replaces that entry's associations and
 *   preserves its existing display value and all other entries.
 * saveQuestionSeedEntries({vertical, entries}) -> Promise<Entry[]>
 *   Explicit replacement of one complete list, including unassigned entries.
 * removeQuestionSeedEntries({vertical, entries: string[]}) -> Promise<Entry[]>
 *   Atomic removal by value, preserving concurrent additions.
 * generateQuestionSeedEntry({vertical, associations?, seed?, save?, useHighLevelSeed?})
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
 * Web reads require sign-in; writes/generation require a verified site administrator.
 */
import {DEFAULT_QUESTION_GENERATION_SEED, QUESTION_SEED_VERTICALS, QUESTION_SEED_LEVELS, QUESTION_SEED_GRADES} from "../../config/firebase/question_seed_generator_schema.js?v=20261017-seed-association-order-v1";
import {FirestoreQuestionSeedGeneratorRepository} from "./infrastructure/firestore_question_seed_generator_repository.js?v=20261017-seed-association-order-v1";
import {GetQuestionSeedGeneratorConfig} from "./application/get_question_seed_generator_config.js?v=20261017-seed-association-order-v1";
import {SaveQuestionSeedGeneratorConfig} from "./application/save_question_seed_generator_config.js?v=20261017-seed-association-order-v1";
import {GetQuestionSeedEntries} from "./application/get_question_seed_entries.js?v=20261017-seed-association-order-v1";
import {SaveQuestionSeedEntries} from "./application/save_question_seed_entries.js?v=20261017-seed-association-order-v1";
import {SaveQuestionSeedEntry} from "./application/save_question_seed_entry.js?v=20261017-seed-association-order-v1";
import {RemoveQuestionSeedEntries} from "./application/remove_question_seed_entries.js?v=20261017-seed-association-order-v1";
import {GenerateQuestionSeedEntry} from "./application/generate_question_seed_entry.js?v=20261017-seed-association-order-v1";
import {GetRandomQuestionSeedEntry} from "./application/get_random_question_seed_entry.js?v=20261017-seed-association-order-v1";
import {GetCombinedQuestionSeed} from "./application/get_combined_question_seed.js?v=20261017-seed-association-order-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {generateLlmText} from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";

function currentAccountAccess() {
  const user = requireCurrentFirebaseAuthUser();
  return {
    user,
    assertAccess() {
      const current = requireCurrentFirebaseAuthUser();
      if (current.uid !== user.uid
          || current.email?.trim().toLowerCase() !== user.email?.trim().toLowerCase()
          || current.emailVerified !== user.emailVerified) {
        throw new Error("The signed-in account changed. Try again.");
      }
    },
  };
}

async function requireQuestionSeedAdministrator() {
  const {user, assertAccess} = currentAccountAccess();
  const status = await requireCurrentSiteAdmin();
  assertAccess();
  if (!user.emailVerified || user.email?.trim().toLowerCase() !== status.email) {
    throw new Error("The signed-in administrator account changed. Try again.");
  }
  return {uid: user.uid, assertAccess};
}

const repository = new FirestoreQuestionSeedGeneratorRepository();
const getConfig = new GetQuestionSeedGeneratorConfig(repository);
const saveConfig = new SaveQuestionSeedGeneratorConfig(repository, requireQuestionSeedAdministrator);
const getEntries = new GetQuestionSeedEntries(repository);
const saveEntries = new SaveQuestionSeedEntries(repository, requireQuestionSeedAdministrator);
const saveEntry = new SaveQuestionSeedEntry(repository, requireQuestionSeedAdministrator);
const removeEntries = new RemoveQuestionSeedEntries(repository, requireQuestionSeedAdministrator);
const generateEntry = new GenerateQuestionSeedEntry({repository,
  requireAdministrator: requireQuestionSeedAdministrator,
  generateLlmText: (prompt, options) => generateLlmText(prompt, {...options, useDirectFunction: true}),
});
const getRandomEntry = new GetRandomQuestionSeedEntry(repository);
const getCombinedSeed = new GetCombinedQuestionSeed(repository);

async function readWithAccess(operation) {
  const {assertAccess} = currentAccountAccess();
  const result = await operation();
  assertAccess();
  return result;
}

async function getQuestionSeedGeneratorConfig() { return readWithAccess(() => getConfig.execute()); }
async function saveQuestionSeedGeneratorConfig(input) {
  requireCurrentFirebaseAuthUser();
  return saveConfig.execute(input);
}
async function getQuestionSeedEntries(input) { return readWithAccess(() => getEntries.execute(input)); }
async function saveQuestionSeedEntries(input) {
  requireCurrentFirebaseAuthUser();
  return saveEntries.execute(input);
}
async function saveQuestionSeedEntry(input) {
  requireCurrentFirebaseAuthUser();
  return saveEntry.execute(input);
}
async function removeQuestionSeedEntries(input) {
  requireCurrentFirebaseAuthUser();
  return removeEntries.execute(input);
}
async function generateQuestionSeedEntry(input) {
  requireCurrentFirebaseAuthUser();
  return generateEntry.execute(input);
}
async function getRandomQuestionSeedEntry(input) { return readWithAccess(() => getRandomEntry.execute(input)); }
async function getCombinedQuestionSeed(input) { return readWithAccess(() => getCombinedSeed.execute(input)); }

export {
  DEFAULT_QUESTION_GENERATION_SEED, QUESTION_SEED_VERTICALS, QUESTION_SEED_LEVELS, QUESTION_SEED_GRADES,
  getQuestionSeedGeneratorConfig, saveQuestionSeedGeneratorConfig,
  getQuestionSeedEntries, saveQuestionSeedEntries, saveQuestionSeedEntry, removeQuestionSeedEntries, generateQuestionSeedEntry,
  getRandomQuestionSeedEntry, getCombinedQuestionSeed,
};
