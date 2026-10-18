import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./question_seed_generator_module.js";
import * as webSchema from "../../config/firebase/question_seed_generator_schema.js";
import * as webLlm from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {GetRandomQuestionSeedEntry as WebRandom} from "./application/get_random_question_seed_entry.js";
import {GetCombinedQuestionSeed as WebCombined} from "./application/get_combined_question_seed.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const backendLlm = require("../../../functions/utils/llm/llm_ops.js");
const originalOps = {...backendOps};
const originalBackendLlm = backendLlm.generateLlmText;
const originalAdapter = new webLlm.LlmUtil().getProviderAdapter("deepseek");
const originalFirebase = globalThis.firebase;
const documents = new Map();
const versions = new Map();
const reads = [];
const writes = [];
const llmCalls = [];
const adminChecks = [];
const now = new Date("2026-10-17T00:00:00Z");
const collection = "questionSeedGenerator";
const configPath = collection + "/config";
const administrator = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...administrator}};
let onAdminCheck;
let onRead;
let onLlm;
let onTransactionRead;
let readFailurePath;
let writeFailure;
let omitConfigSave;
let transactionAttempts;
let responses;

function put(path, data) {
  documents.set(path, structuredClone(data));
  versions.set(path, (versions.get(path) || 0) + 1);
}

function snapshot(path) {
  const exists = documents.has(path);
  const data = exists ? structuredClone(documents.get(path)) : undefined;
  return {id: path.split("/").at(-1), exists, data: () => data};
}

async function read(path) {
  reads.push(path);
  await onRead?.(path);
  if (readFailurePath === path) throw new Error("Read unavailable");
  return snapshot(path);
}

function save(path, data, options) {
  if (writeFailure) throw writeFailure;
  writes.push({path, data: structuredClone(data), options});
  if (omitConfigSave && path === configPath) return;
  const stored = {...(options?.merge ? documents.get(path) : {}), ...data};
  if (Object.hasOwn(stored, "updatedAt")) stored.updatedAt = new Date(now.getTime() + writes.length);
  put(path, stored);
}

function reference(path) {
  return {
    path, id: path.split("/").at(-1),
    get: () => read(path),
    async set(data, options) { save(path, data, options); },
  };
}

const db = {
  collection: path => ({doc: id => reference(path + "/" + id)}),
  async runTransaction(operation) {
    for (let attempt = 0; attempt < 8; attempt++) {
      transactionAttempts++;
      const seen = new Map();
      const pending = [];
      const result = await operation({
        async get(ref) {
          seen.set(ref.path, versions.get(ref.path) || 0);
          const data = await ref.get();
          await onTransactionRead?.(ref.path);
          return data;
        },
        set(ref, data) { pending.push({ref, data}); },
      });
      if ([...seen].some(([path, version]) => (versions.get(path) || 0) !== version)) continue;
      for (const {ref, data} of pending) save(ref.path, data, {merge: false});
      return result;
    }
    throw new Error("Transaction retries exhausted");
  },
};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
const app = {
  firestore: () => db, auth: () => auth,
  functions(region) {
    assert.equal(region, "us-central1");
    return {httpsCallable(name) {
      assert.equal(name, "isCurrentUserSiteAdmin", "No question-seed callable gateway is allowed.");
      return async () => {
        adminChecks.push(name);
        const user = auth.currentUser;
        const status = {
          email: user?.email?.trim().toLowerCase() || null,
          emailVerified: user?.emailVerified === true,
          isAdmin: user?.email?.trim().toLowerCase() === administrator.email,
        };
        await onAdminCheck?.();
        return {data: status};
      };
    }};
  },
};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.readDocument = async (path, id) => {
  const data = await read(path + "/" + id);
  return data.exists ? data.data() : null;
};
backendOps.writeDocument = async (path, id, data, options) => save(path + "/" + id, data, options);
backendOps.getFirestoreDb = () => db;

async function generateLlmText(prompt, options) {
  const call = {prompt, options};
  llmCalls.push(call);
  await onLlm?.(call);
  const response = responses.length ? responses.shift() : {entry: "New entry " + llmCalls.length};
  if (response instanceof Error) throw response;
  return response;
}
backendLlm.generateLlmText = generateLlmText;
webLlm.registerLlmProvider("deepseek", {call() {throw new Error("Use generateLlmText");}, generateText: generateLlmText});
const backend = require("../../../functions/features/question_seed_generator/question_seed_generator_module.js");
const backendSchema = require("../../../functions/schema/question_seed_generator_schema.js");
const {GetRandomQuestionSeedEntry: BackendRandom} = require("../../../functions/features/question_seed_generator/application/get_random_question_seed_entry.js");
const {GetCombinedQuestionSeed: BackendCombined} = require("../../../functions/features/question_seed_generator/application/get_combined_question_seed.js");

const apiNames = [
  "getQuestionSeedGeneratorConfig", "saveQuestionSeedGeneratorConfig", "getQuestionSeedEntries",
  "saveQuestionSeedEntries", "saveQuestionSeedEntry", "removeQuestionSeedEntries",
  "generateQuestionSeedEntry", "getRandomQuestionSeedEntry", "getCombinedQuestionSeed",
];
const context = {updatedBy: administrator.uid};
const scope = {level: "primary", grade: 1};
const associations = {primary: [1, 2], secondary: [2]};
const entry = (value, links = associations) => ({value, associations: structuredClone(links)});
const configuration = (changes = {}) => ({generationSeed: "latest news", additionalLlmInstructions: "", ...changes});
const savedConfiguration = (changes = {}) => ({...configuration(), updatedAt: now, updatedBy: administrator.uid, ...changes});
function seedPools() {
  for (const [vertical, value] of [["theme", "Technology"], ["setting", "Community library"], ["type", "Persuasive"]]) {
    put(collection + "/" + vertical, {entries: [entry(value)]});
  }
}
function invoke(api, name, input, ctx = context) {return api === backend ? api[name](input, ctx) : api[name](input);}
const saveConfig = (api, input, ctx) => invoke(api, "saveQuestionSeedGeneratorConfig", input, ctx);
const saveEntries = (api, input, ctx) => invoke(api, "saveQuestionSeedEntries", input, ctx);
const saveOne = (api, input, ctx) => invoke(api, "saveQuestionSeedEntry", input, ctx);
const removeEntries = (api, input, ctx) => invoke(api, "removeQuestionSeedEntries", input, ctx);
const generate = (api, input, ctx) => invoke(api, "generateQuestionSeedEntry", {associations: structuredClone(associations), ...input}, ctx);
const list = (api, vertical = "theme", filter = {}) => api.getQuestionSeedEntries({vertical, ...filter});

beforeEach(() => {
  documents.clear(); versions.clear(); reads.length = writes.length = llmCalls.length = adminChecks.length = 0;
  onAdminCheck = onRead = onLlm = onTransactionRead = null;
  readFailurePath = writeFailure = null;
  omitConfigSave = false; transactionAttempts = 0; responses = [];
  auth.currentUser = {...administrator};
});
after(() => {
  Object.assign(backendOps, originalOps); backendLlm.generateLlmText = originalBackendLlm;
  webLlm.registerLlmProvider("deepseek", originalAdapter);
  if (originalFirebase === undefined) delete globalThis.firebase; else globalThis.firebase = originalFirebase;
});

test("backend and web expose matching schemas, nine APIs, level enums and grade bounds", () => {
  for (const name of apiNames) for (const api of [backend, web]) assert.equal(typeof api[name], "function");
  for (const key of Object.keys(webSchema)) assert.deepEqual(webSchema[key], backendSchema[key]);
  assert.deepEqual(web.QUESTION_SEED_LEVELS, {PRIMARY: "primary", SECONDARY: "secondary"});
  assert.deepEqual(web.QUESTION_SEED_GRADES, [1, 2, 3, 4, 5, 6]);
  assert.equal(web.DEFAULT_QUESTION_GENERATION_SEED, "latest news");
  assert.equal(webSchema.questionSeedEntriesSchema.fields.entries.items.type, "map");
});

for (const [layer, api, Random, Combined] of [
  ["backend", backend, BackendRandom, BackendCombined], ["web", web, WebRandom, WebCombined],
]) {
  test(layer + ": missing configuration and pools never persist defaults", async () => {
    assert.equal(await api.getQuestionSeedGeneratorConfig(), null);
    assert.deepEqual(await list(api), []);
    await assert.rejects(() => api.getCombinedQuestionSeed(scope), /theme.*primary.*1/);
    assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []); assert.deepEqual(adminChecks, []);
  });
  test(layer + ": configuration retains trusted metadata and blank-seed defaults", async () => {
    const input = configuration({generationSeed: " ", additionalLlmInstructions: " Simple language. ", updatedBy: "spoofed", extra: "discard"});
    const saved = await saveConfig(api, input);
    assert.equal(saved.generationSeed, "latest news");
    assert.equal(saved.additionalLlmInstructions, "Simple language.");
    assert.equal(saved.updatedBy, administrator.uid);
    assert.ok(saved.updatedAt instanceof Date);
    assert.ok(Object.isFrozen(saved));
    assert.deepEqual(await api.getQuestionSeedGeneratorConfig(), saved);
    assert.deepEqual(Object.keys(documents.get(configPath)).sort(), ["additionalLlmInstructions", "generationSeed", "updatedAt", "updatedBy"]);
    assert.equal(writes[0].options.merge, false);
    await saveConfig(api, configuration({generationSeed: " Oceans "}));
    assert.equal((await api.getQuestionSeedGeneratorConfig()).generationSeed, "Oceans");
  });
  test(layer + ": invalid or corrupt configuration fails without replacement defaults", async () => {
    for (const input of [null, [], {}, configuration({generationSeed: null}), configuration({additionalLlmInstructions: undefined})]) {
      await assert.rejects(() => saveConfig(api, input));
    }
    assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(adminChecks, []);
    for (const changes of [{updatedAt: null}, {updatedAt: new Date(NaN)}, {updatedBy: ""}, {generationSeed: false}]) {
      put(configPath, savedConfiguration(changes));
      await assert.rejects(() => api.getQuestionSeedGeneratorConfig());
    }
    documents.clear(); omitConfigSave = true;
    await assert.rejects(() => saveConfig(api, configuration()), /could not be read/);
  });
  test(layer + ": object lists round trip normalized associations and ignore extra metadata", async () => {
    const input = {vertical: "theme", entries: [
      {...entry("  Climate\nchange ", {secondary: [6, 2], primary: [3, 1]}), extra: "discard"},
      entry("Unassigned", {primary: []}),
    ]};
    const before = structuredClone(input);
    const saved = await saveEntries(api, input);
    assert.deepEqual(input, before);
    assert.deepEqual(saved, [entry("Climate change", {primary: [1, 3], secondary: [2, 6]}), entry("Unassigned", {})]);
    assert.deepEqual(documents.get(collection + "/theme"), {entries: saved});
    saved[0].associations.primary.push(6);
    assert.deepEqual((await list(api))[0].associations.primary, [1, 3]);
    assert.deepEqual(await saveEntries(api, {vertical: "theme", entries: []}), []);
  });
  test(layer + ": string entries are read as unassigned without writes and migrate on association save", async () => {
    put(collection + "/theme", {entries: ["  Friendship ", entry("Technology")]});
    assert.deepEqual(await list(api), [entry("Friendship", {}), entry("Technology")]);
    assert.deepEqual(await list(api, "theme", scope), [entry("Technology")]);
    assert.deepEqual(writes, []);
    assert.equal(typeof documents.get(collection + "/theme").entries[0], "string");
    const saved = await saveOne(api, {vertical: "theme", entry: entry("friendship", {primary: [1, 6]})});
    assert.deepEqual(saved, entry("Friendship", {primary: [1, 6]}));
    assert.deepEqual(documents.get(collection + "/theme"), {entries: [saved, entry("Technology")]});
    assert.equal(writes.length, 1);
  });
  test(layer + ": single save upserts associations by normalized value and preserves other entries", async () => {
    seedPools(); put(configPath, savedConfiguration());
    await saveOne(api, {vertical: "theme", entry: entry("  TECHNOLOGY  ", {secondary: [6]})});
    assert.deepEqual(await list(api), [entry("Technology", {secondary: [6]})]);
    assert.deepEqual(await list(api, "theme", scope), []);
    await saveOne(api, {vertical: "theme", entry: entry("Friendship", {primary: [1]})});
    assert.deepEqual(await list(api), [entry("Technology", {secondary: [6]}), entry("Friendship", {primary: [1]})]);
    await saveOne(api, {vertical: "theme", entry: entry("Technology", {})});
    assert.deepEqual((await list(api))[0], entry("Technology", {}));
    assert.deepEqual(documents.get(collection + "/setting"), {entries: [entry("Community library")]});
    assert.deepEqual(documents.get(configPath), savedConfiguration());
    assert.deepEqual(llmCalls, []);
  });
  test(layer + ": invalid levels, grades, records and duplicate values fail before authorization", async () => {
    const invalid = [null, [], {primary: null}, {other: [1]}, {Primary: [1]}, {primary: [0]}, {primary: [7]},
      {primary: [1.5]}, {primary: ["1"]}, {primary: [true]}, {primary: [1, 1]}, {primary: Array(1)}];
    for (const links of invalid) {
      await assert.rejects(() => saveOne(api, {vertical: "theme", entry: entry("A", links)}));
      await assert.rejects(() => generate(api, {vertical: "theme", associations: links}));
    }
    for (const value of [null, "", "  ", 1, {}, [], undefined]) {
      await assert.rejects(() => saveOne(api, {vertical: "theme", entry: {value, associations: {}}}));
    }
    for (const entries of [null, "one", ["Legacy write"], [entry("A"), entry(" a ")], Array(1)]) {
      await assert.rejects(() => saveEntries(api, {vertical: "theme", entries}));
    }
    assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(adminChecks, []); assert.deepEqual(llmCalls, []);
  });
  test(layer + ": omitted or empty associations allow generation before tagging without adding grade targets to the prompt", async () => {
    for (const selection of [undefined, {}]) {
      const generated = await generate(api, {vertical: "theme", associations: selection, save: false});
      assert.deepEqual(generated.associations, {});
      assert.equal(llmCalls.at(-1).prompt.includes("Target school levels and grades"), false);
      assert.ok(llmCalls.at(-1).prompt.includes("administrator will assign its level and grade associations afterward"));
    }
    assert.deepEqual(writes, []);
    const generated = await invoke(api, "generateQuestionSeedEntry", {vertical: "theme", save: false});
    await saveOne(api, {vertical: "theme", entry: {value: generated.value, associations: {primary: [2, 3], secondary: [1]}}});
    assert.deepEqual(await list(api, "theme", {level: "primary", grade: 3}), [entry(generated.value, {primary: [2, 3], secondary: [1]})]);
  });
  test(layer + ": default generation can save an unassigned entry for later association editing", async () => {
    const generated = await invoke(api, "generateQuestionSeedEntry", {vertical: "theme"});
    assert.deepEqual(generated.associations, {});
    assert.deepEqual(await list(api), [generated]);
    assert.deepEqual(await list(api, "theme", scope), []);
    assert.equal(llmCalls[0].prompt.includes("Target school levels and grades"), false);
    await saveOne(api, {vertical: "theme", entry: entry(generated.value, {primary: [1]})});
    assert.equal(await api.getRandomQuestionSeedEntry({vertical: "theme", ...scope}), generated.value);
    assert.equal(llmCalls.length, 1);
  });
  test(layer + ": scoped filtering uses exact level-grade pairs and excludes unassigned entries", async () => {
    put(collection + "/theme", {entries: [
      entry("Both", {primary: [1], secondary: [2]}), entry("Primary two", {primary: [2]}), entry("Unassigned", {}),
    ]});
    assert.deepEqual(await list(api, "theme", {level: "primary", grade: 2}), [entry("Primary two", {primary: [2]})]);
    assert.deepEqual(await list(api, "theme", {level: "secondary", grade: 2}), [entry("Both", {primary: [1], secondary: [2]})]);
    assert.equal((await list(api)).length, 3);
    assert.equal(await api.getRandomQuestionSeedEntry({vertical: "theme", level: "primary", grade: 2}), "Primary two");
    assert.deepEqual(writes, []);
  });
  test(layer + ": selection validates complete scope and enums before reading", async () => {
    for (const selection of [null, {}, {level: "primary"}, {grade: 1}, {level: "other", grade: 1},
      {level: "Primary", grade: 1}, {level: "primary", grade: "1"}, {level: "secondary", grade: 7}]) {
      await assert.rejects(() => api.getCombinedQuestionSeed(selection));
      await assert.rejects(() => api.getRandomQuestionSeedEntry({vertical: "theme", ...selection}));
      if (selection && Object.keys(selection).length) await assert.rejects(() => list(api, "theme", selection));
    }
    for (const vertical of ["config", "Theme", "", "theme/other", null, 1]) {
      await assert.rejects(() => list(api, vertical), /vertical/);
    }
    assert.deepEqual(reads, []); assert.deepEqual(writes, []);
  });
  test(layer + ": combined selection formats matching values without LLM and reports missing scope per vertical", async () => {
    seedPools();
    assert.equal(await api.getCombinedQuestionSeed(scope), "Theme: Technology\nSetting: Community library\nType: Persuasive");
    for (const vertical of ["theme", "setting", "type"]) {
      seedPools(); put(collection + "/" + vertical, {entries: ["Unassigned", entry("Other grade", {primary: [2]})]});
      await assert.rejects(() => api.getCombinedQuestionSeed(scope), new RegExp(vertical + ".*primary.*1"));
    }
    assert.deepEqual(llmCalls, []); assert.deepEqual(writes, []);
  });
  test(layer + ": random selection samples eligible boundaries and combined uses three independent draws", async () => {
    const pools = {theme: [entry("A"), entry("Skip", {}), entry("B")], setting: [entry("C"), entry("D")], type: [entry("E"), entry("F")]};
    const repo = {getEntries: async vertical => pools[vertical]};
    assert.equal(await new Random(repo, () => 0).execute({vertical: "theme", ...scope}), "A");
    assert.equal(await new Random(repo, () => 0.999999).execute({vertical: "theme", ...scope}), "B");
    const draws = [0.99999, 0, 0.99999];
    assert.equal(await new Combined(repo, () => draws.shift()).execute(scope), "Theme: B\nSetting: C\nType: F");
    assert.deepEqual(draws, []);
  });
  test(layer + ": generation sends requested associations and every saved value, then stores an Entry", async () => {
    put(collection + "/theme", {entries: ["Legacy", entry("Other grade", {secondary: [6]})]});
    responses.push({entry: "  New\nidea  ", associations: {primary: [6]}, extra: "discard"});
    const result = await generate(api, {vertical: "theme", associations: {secondary: [3, 1], primary: [2]}});
    assert.deepEqual(result, entry("New idea", {primary: [2], secondary: [1, 3]}));
    const {prompt, options} = llmCalls[0];
    assert.ok(prompt.includes('{"primary":[2],"secondary":[1,3]}'));
    assert.ok(prompt.includes('["Legacy","Other grade"]'));
    assert.ok(prompt.includes("suitable for every listed school level and grade"));
    assert.ok(prompt.includes("Generation inspiration (not a numeric random seed):\nlatest news"));
    assert.equal(options.maxTokens, 512);
    if (layer === "web") assert.equal(options.useDirectFunction, true);
    assert.deepEqual(documents.get(collection + "/theme").entries, [entry("Legacy", {}), entry("Other grade", {secondary: [6]}), result]);
    assert.equal(documents.has(configPath), false);
  });
  test(layer + ": previews do not save and duplicate checking spans all associations", async () => {
    put(collection + "/theme", {entries: [entry("Existing", {secondary: [6]})]});
    responses.push({entry: " existing "}, {entry: "New idea"});
    assert.deepEqual(await generate(api, {vertical: "theme", save: false}), entry("New idea"));
    assert.equal(llmCalls.length, 2);
    responses.push(...Array.from({length: 3}, () => ({entry: "EXISTING"})));
    await assert.rejects(() => generate(api, {vertical: "theme", save: false}), {code: "question-seed-duplicate"});
    assert.equal(llmCalls.length, 5);
    assert.deepEqual(writes, []);
  });
  test(layer + ": seed fallbacks, opt-out and literal instructions survive association prompts", async () => {
    put(configPath, savedConfiguration({generationSeed: "Saved inspiration", additionalLlmInstructions: "Use $& and {{seed}} literally."}));
    await generate(api, {vertical: "theme", save: false});
    await generate(api, {vertical: "theme", seed: " Request inspiration ", save: false});
    await generate(api, {vertical: "theme", seed: " ", save: false});
    await generate(api, {vertical: "theme", seed: "Ignored inspiration", useHighLevelSeed: false, save: false});
    assert.ok(llmCalls[0].prompt.includes("\nSaved inspiration\n"));
    assert.ok(llmCalls[1].prompt.includes("\nRequest inspiration\n"));
    assert.ok(llmCalls[2].prompt.includes("\nSaved inspiration\n"));
    for (const text of ["Saved inspiration", "Ignored inspiration", "latest news", "Generation inspiration"]) {
      assert.equal(llmCalls[3].prompt.includes(text), false);
    }
    assert.ok(llmCalls.every(call => call.prompt.includes("Use $& and {{seed}} literally.")));
    assert.deepEqual(writes, []);
  });
  test(layer + ": invalid generation switches and malformed/exhausted LLM responses do not write", async () => {
    for (const key of ["save", "useHighLevelSeed"]) for (const value of [null, "false", 0, {}]) {
      await assert.rejects(() => generate(api, {vertical: "theme", [key]: value}), new RegExp(key));
    }
    for (const seed of [null, 1, []]) await assert.rejects(() => generate(api, {vertical: "theme", seed}), /seed/);
    assert.deepEqual(reads, []); assert.deepEqual(adminChecks, []);
    for (const response of ["not JSON", null, [], {}, {entry: []}, {entry: {value: "Bad"}}, {entry: ""}, new Error("LLM unavailable")]) {
      responses.push(response); await assert.rejects(() => generate(api, {vertical: "theme"}));
    }
    responses.push({entry: null});
    await assert.rejects(() => generate(api, {vertical: "type"}), {code: "question-seed-exhausted"});
    assert.deepEqual(writes, []);
  });
  test(layer + ": caller changes during async authorization cannot change saved or generated associations", async () => {
    const input = {vertical: "theme", entry: entry("Original", {primary: [1]})};
    const pendingSave = saveOne(api, input);
    input.entry.associations.primary.push(6); input.entry.value = "Mutated";
    assert.deepEqual(await pendingSave, entry("Original", {primary: [1]}));
    const gen = {vertical: "setting", associations: {secondary: [2]}, useHighLevelSeed: false, save: false};
    const pendingGen = generate(api, gen);
    gen.associations.secondary.push(6); gen.useHighLevelSeed = true;
    assert.deepEqual((await pendingGen).associations, {secondary: [2]});
    assert.ok(llmCalls[0].prompt.includes('{"secondary":[2]}'));
    assert.equal(llmCalls[0].prompt.includes("latest news"), false);
  });
  test(layer + ": concurrent upserts preserve other associations and new entries", async () => {
    put(collection + "/theme", {entries: [entry("A"), entry("B")]});
    await Promise.all([
      saveOne(api, {vertical: "theme", entry: entry("A", {secondary: [6]})}),
      saveOne(api, {vertical: "theme", entry: entry("C", {primary: [3]})}),
    ]);
    assert.deepEqual(await list(api), [entry("A", {secondary: [6]}), entry("B"), entry("C", {primary: [3]})]);
    assert.ok(transactionAttempts >= 3);
  });
  test(layer + ": concurrent generated candidates never overwrite saved associations", async () => {
    responses.push({entry: "Same"}, {entry: " same "}, {entry: "Different"});
    const values = await Promise.all([
      generate(api, {vertical: "theme", associations: {primary: [1]}}),
      generate(api, {vertical: "theme", associations: {secondary: [2]}}),
    ]);
    assert.deepEqual(values.map(item => item.value).sort(), ["Different", "Same"]);
    assert.equal(llmCalls.length, 3);
    assert.equal((await list(api)).length, 2);
    assert.deepEqual((await list(api)).find(item => item.value === "Same").associations, {primary: [1]});
  });
  test(layer + ": removing by string values preserves object associations and other pools", async () => {
    seedPools(); put(collection + "/theme", {entries: ["Legacy", entry("Technology"), entry("Friendship", {secondary: [6]})]});
    const remaining = await removeEntries(api, {vertical: "theme", entries: [" legacy ", "TECHNOLOGY"]});
    assert.deepEqual(remaining, [entry("Friendship", {secondary: [6]})]);
    assert.deepEqual(documents.get(collection + "/theme"), {entries: remaining});
    assert.deepEqual(documents.get(collection + "/setting"), {entries: [entry("Community library")]});
    assert.deepEqual(await removeEntries(api, {vertical: "theme", entries: ["Missing"]}), remaining);
    assert.equal(writes.length, 1);
    assert.deepEqual(await removeEntries(api, {vertical: "theme", entries: ["Friendship"]}), []);
    assert.deepEqual(await removeEntries(api, {vertical: "theme", entries: ["Friendship"]}), []);
    assert.equal(writes.length, 2);
    assert.deepEqual(await removeEntries(api, {vertical: "type", entries: ["Persuasive"]}), []);
    await assert.rejects(() => api.getCombinedQuestionSeed(scope), /theme/);
  });
  test(layer + ": removal validation snapshots values and does not create missing pools", async () => {
    for (const entries of [[], null, [entry("A")], [""], ["A", "a"]]) {
      await assert.rejects(() => removeEntries(api, {vertical: "theme", entries}));
    }
    assert.deepEqual(reads, []); assert.deepEqual(adminChecks, []);
    assert.deepEqual(await removeEntries(api, {vertical: "theme", entries: ["Missing"]}), []);
    assert.equal(documents.has(collection + "/theme"), false);
    put(collection + "/theme", {entries: [entry("A"), entry("B")]});
    const input = {vertical: "theme", entries: ["A"]};
    const pending = removeEntries(api, input); input.entries[0] = "B";
    assert.deepEqual(await pending, [entry("B")]);
  });
  test(layer + ": removal rechecks concurrent additions and association edits", async () => {
    put(collection + "/theme", {entries: [entry("A"), entry("B")]});
    let changed = false;
    onTransactionRead = path => {
      if (!changed) {changed = true; put(path, {entries: [entry("A"), entry("B", {secondary: [6]}), entry("C")]});}
    };
    assert.deepEqual(await removeEntries(api, {vertical: "theme", entries: ["A"]}), [entry("B", {secondary: [6]}), entry("C")]);
    assert.ok(transactionAttempts >= 2);
  });
  test(layer + ": corrupt records and storage failures propagate without erasing data", async () => {
    for (const data of [{}, {entries: null}, {entries: [entry("A"), entry("a")]}, {entries: [{value: "A", associations: {other: [1]}}]}]) {
      put(collection + "/theme", data);
      await assert.rejects(() => list(api));
      await assert.rejects(() => generate(api, {vertical: "theme"}));
    }
    seedPools(); readFailurePath = collection + "/theme";
    await assert.rejects(() => api.getCombinedQuestionSeed(scope), /Read unavailable/);
    readFailurePath = null; writeFailure = new Error("Write unavailable");
    await assert.rejects(() => saveOne(api, {vertical: "theme", entry: entry("A")}), /Write unavailable/);
    await assert.rejects(() => removeEntries(api, {vertical: "theme", entries: ["Technology"]}), /Write unavailable/);
    await assert.rejects(() => saveConfig(api, configuration()), /Write unavailable/);
    assert.deepEqual(documents.get(collection + "/theme"), {entries: [entry("Technology")]});
    assert.deepEqual(writes, []);
  });
}

test("backend mutation APIs require trusted administrator context", async () => {
  for (const ctx of [null, {}, {updatedBy: ""}, {updatedBy: 1}]) {
    for (const [name, input] of [
      ["saveQuestionSeedGeneratorConfig", configuration()],
      ["saveQuestionSeedEntry", {vertical: "theme", entry: entry("A")}],
      ["saveQuestionSeedEntries", {vertical: "theme", entries: []}],
      ["removeQuestionSeedEntries", {vertical: "theme", entries: ["A"]}],
      ["generateQuestionSeedEntry", {vertical: "theme", associations}],
    ]) await assert.rejects(() => backend[name](input, ctx), /administrator UID/);
  }
  assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []);
});
const mutationInputs = [
  ["saveQuestionSeedGeneratorConfig", configuration()],
  ["saveQuestionSeedEntry", {vertical: "theme", entry: entry("A")}],
  ["saveQuestionSeedEntries", {vertical: "theme", entries: []}],
  ["removeQuestionSeedEntries", {vertical: "theme", entries: ["A"]}],
  ["generateQuestionSeedEntry", {vertical: "theme", associations}],
];
test("all web APIs require sign-in", async () => {
  auth.currentUser = null;
  for (const [name, input] of [...mutationInputs,
    ["getQuestionSeedGeneratorConfig", undefined], ["getQuestionSeedEntries", {vertical: "theme"}],
    ["getRandomQuestionSeedEntry", {vertical: "theme", ...scope}], ["getCombinedQuestionSeed", scope],
  ]) await assert.rejects(() => web[name](input), /signed in/);
  assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []);
});
test("students can read/select, but only verified site administrators may mutate or generate", async () => {
  seedPools(); auth.currentUser = {uid: "student", email: "student@example.com", emailVerified: false};
  assert.equal(await web.getCombinedQuestionSeed(scope), "Theme: Technology\nSetting: Community library\nType: Persuasive");
  for (const user of [auth.currentUser, {...auth.currentUser, emailVerified: true}, {...administrator, emailVerified: false}]) {
    auth.currentUser = user;
    for (const [name, input] of mutationInputs) await assert.rejects(() => web[name](input), /Verify|administrator/);
  }
  assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []);
});
test("web admin checks reject identity changes before data access", async () => {
  for (const next of [null, {...administrator, uid: "changed"}, {...administrator, email: "changed@example.com"}, {...administrator, emailVerified: false}]) {
    for (const [name, input] of mutationInputs) {
      auth.currentUser = {...administrator}; onAdminCheck = () => {auth.currentUser = next;};
      await assert.rejects(() => web[name](input), /signed in|account changed/);
    }
  }
  assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []);
});
test("web rejects account changes during reads, generation and transactional writes", async () => {
  seedPools(); onRead = () => {auth.currentUser = null;};
  await assert.rejects(() => web.getCombinedQuestionSeed(scope), /signed in/);
  auth.currentUser = {...administrator}; onRead = null;
  onLlm = () => {auth.currentUser = {...administrator, uid: "changed"};};
  await assert.rejects(() => generate(web, {vertical: "theme"}), /account changed/);
  onLlm = null;
  for (const [name, input] of mutationInputs.filter(([name]) => ["saveQuestionSeedEntry", "removeQuestionSeedEntries"].includes(name))) {
    auth.currentUser = {...administrator}; onTransactionRead = () => {auth.currentUser = null;};
    await assert.rejects(() => web[name](input), /signed in/);
  }
  assert.deepEqual(writes, []);
});
