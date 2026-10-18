import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import * as web from "./essay_question_generator_module.js";
import * as webSchema from "../../config/firebase/essay_question_generator_schema.js";
import * as webLlm from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {GetRandomEssayQuestion as WebRandom} from "./application/get_random_essay_question.js";
import {questionCollectionPath, encodeCursor} from "./domain/essay_question.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops");
const backendLlm = require("../../../functions/utils/llm/llm_ops");
const originalOps = {...backendOps}, originalBackendLlm = backendLlm.generateLlmText;
const originalAdapter = new webLlm.LlmUtil().getProviderAdapter("deepseek"), originalFirebase = globalThis.firebase;
const documents = new Map(), reads = [], writes = [], llmCalls = [], adminChecks = [], queries = [];
const now = new Date("2026-10-17T12:00:00Z");
const administrator = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...administrator}};
const configPath = "essayQuestionGenerator/config";
let autoId, onRead, onAdminCheck, onLlm, onTransactionRead, readFailurePath, writeFailure, response;

function put(path, data) {documents.set(path, structuredClone(data));}
function snapshot(path) {
  return {id: path.split("/").at(-1), exists: documents.has(path),
    data: () => documents.has(path) ? structuredClone(documents.get(path)) : undefined};
}
async function read(path) {
  reads.push(path); await onRead?.(path);
  if (readFailurePath === path) throw new Error("Read unavailable");
  return snapshot(path);
}
function save(path, data, options) {
  if (writeFailure) throw writeFailure;
  const copied = {...data};
  for (const field of ["updatedAt", "generatedAt"]) if (Object.hasOwn(copied, field)) copied[field] = now;
  writes.push({path, data: structuredClone(copied), options});
  put(path, copied);
}
function reference(path) {
  return {path, id: path.split("/").at(-1), get: () => read(path),
    set: async (data, options) => save(path, data, options),
    collection: name => query(path + "/" + name)};
}
function query(path, criteria = {}) {
  return {
    doc: id => reference(path + "/" + (id ?? String(++autoId).padStart(20, "0"))),
    where(field, operator, value) {
      assert.equal(field, "difficulty"); assert.equal(operator, "==");
      return query(path, {...criteria, difficulty: value});
    },
    orderBy(field) {assert.ok(field); return query(path, {...criteria, ordered: true});},
    startAfter(id) {assert.equal(typeof id, "string"); return query(path, {...criteria, after: id});},
    limit(limit) {assert.ok(Number.isSafeInteger(limit) && limit > 0); return query(path, {...criteria, limit});},
    async get() {
      queries.push({path, ...criteria}); reads.push(path); await onRead?.(path);
      if (readFailurePath === path) throw new Error("Read unavailable");
      assert.equal(criteria.ordered, true);
      const prefix = path + "/";
      const paths = [...documents.keys()].filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .filter(key => criteria.difficulty === undefined || documents.get(key).difficulty === criteria.difficulty)
        .filter(key => !criteria.after || key.slice(prefix.length) > criteria.after)
        .sort().slice(0, criteria.limit);
      return {docs: paths.map(snapshot)};
    },
  };
}
const db = {
  collection: path => query(path), doc: reference,
  async runTransaction(operation) {
    const pending = [];
    const result = await operation({
      async get(ref) {const data = await ref.get(); await onTransactionRead?.(ref.path); return data;},
      set(ref, data) {pending.push({ref, data});},
    });
    if (writeFailure) throw writeFailure;
    for (const {ref, data} of pending) save(ref.path, data, {merge: false});
    return result;
  },
};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
firestore.FieldPath = {documentId: () => "__name__"};
const app = {firestore: () => db, auth: () => auth, functions() {
  return {httpsCallable(name) {
    assert.equal(name, "isCurrentUserSiteAdmin", "Essay APIs must not use callable endpoints.");
    return async () => {
      adminChecks.push(name);
      const user = auth.currentUser;
      const status = {email: user?.email?.trim().toLowerCase() || null,
        emailVerified: user?.emailVerified === true, isAdmin: user?.email === administrator.email};
      await onAdminCheck?.();
      return {data: status};
    };
  }};
}};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.readDocument = async (path, id) => {const result = await read(path + "/" + id); return result.exists ? result.data() : null;};
backendOps.writeDocument = async (path, id, data, options) => save(path + "/" + id, data, options);
backendOps.getFirestoreDb = () => db;
async function generateLlmText(prompt, options) {
  llmCalls.push({prompt, options}); await onLlm?.();
  if (response instanceof Error) throw response;
  return response;
}
backendLlm.generateLlmText = generateLlmText;
webLlm.registerLlmProvider("deepseek", {call() {throw new Error("Use generateLlmText");}, generateText: generateLlmText});
const backend = require("../../../functions/features/essay_question_generator/essay_question_generator_module");
const backendSchema = require("../../../functions/schema/essay_question_generator_schema");
const {GetRandomEssayQuestion: BackendRandom} = require("../../../functions/features/essay_question_generator/application/get_random_essay_question");
const apis = ["getEssayQuestionGeneratorConfig", "saveEssayQuestionGeneratorConfig", "generateEssayQuestion", "saveEssayQuestion",
  "getEssayQuestionById", "listEssayQuestions", "getRandomEssayQuestion"];
const scope = {level: "primary", standard: 3, language: "English"};
const generation = changes => ({...scope, difficulty: "medium", seed: "Theme: Friendship\nSetting: School\nType: Narrative", ...changes});
const configuration = () => web.createDefaultConfiguration();
const context = {updatedBy: administrator.uid};
const indexPath = id => "essayQuestionGenerator/questionIndex/entries/" + id;
const questionData = changes => ({questionText: "Write an essay about a community project.", difficulty: "medium",
  seedUsed: "Community", generatedAt: now, ...changes});
const questionDraft = changes => ({questionId: "preview-id", ...scope, difficulty: "medium",
  questionText: "Write about an act of friendship.", seedUsed: generation().seed, ...changes});
function seedQuestion(id, criteria = scope, changes = {}) {
  const path = questionCollectionPath(criteria) + "/" + id;
  put(path, questionData(changes)); put(indexPath(id), {documentPath: path});
  return path;
}
function invoke(api, name, input, ctx = context) {return api === backend ? api[name](input, ctx) : api[name](input);}

beforeEach(() => {
  documents.clear(); reads.length = writes.length = llmCalls.length = adminChecks.length = queries.length = 0;
  autoId = 0; onRead = onAdminCheck = onLlm = onTransactionRead = null;
  readFailurePath = writeFailure = null; response = {questionText: "Write an essay about a surprising act of friendship."};
  auth.currentUser = {...administrator};
});
after(() => {
  Object.assign(backendOps, originalOps); backendLlm.generateLlmText = originalBackendLlm;
  webLlm.registerLlmProvider("deepseek", originalAdapter);
  if (originalFirebase === undefined) delete globalThis.firebase; else globalThis.firebase = originalFirebase;
});

test("backend and web have matching schemas, enums and seven feature APIs, independent of the seed feature", async () => {
  for (const key of Object.keys(webSchema)) assert.deepEqual(webSchema[key], backendSchema[key]);
  for (const api of [backend, web]) for (const name of apis) assert.equal(typeof api[name], "function");
  assert.deepEqual(web.ESSAY_QUESTION_DIFFICULTIES, {EASY: "easy", MEDIUM: "medium", HARD: "hard"});
  assert.deepEqual(web.ESSAY_QUESTION_LEVELS, {PRIMARY: "primary", SECONDARY: "secondary"});
  for (const name of ["essay_question_generator_module.js", "application/generate_essay_question.js", "application/build_essay_question_prompt.js"]) {
    const source = await readFile(new URL(name, import.meta.url), "utf8");
    assert.doesNotMatch(source, /question_seed_generator|latest news|getCombinedQuestionSeed/);
  }
});

for (const [layer, api, Random] of [["backend", backend, BackendRandom], ["web", web, WebRandom]]) {
  test(layer + ": absent configuration and questions return empty results without writing defaults", async () => {
    assert.equal(await api.getEssayQuestionGeneratorConfig(), null);
    assert.equal(await api.getEssayQuestionById("unknown"), null);
    assert.deepEqual(await api.listEssayQuestions({...scope, limit: 5}), {questions: [], nextCursor: null});
    assert.equal(await api.getRandomEssayQuestion(scope), null);
    const defaults = api.createDefaultConfiguration();
    assert.equal(defaults.additionalLlmInstructions, "");
    for (const grades of Object.values(defaults.gradeInstructions)) assert.deepEqual(Object.values(grades), ["", "", "", "", "", ""]);
    assert.deepEqual(defaults.difficultyInstructions, {easy: "", medium: "", hard: ""});
    defaults.gradeInstructions.primary[1] = "Changed";
    assert.equal(api.createDefaultConfiguration().gradeInstructions.primary[1], "");
    assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []);
  });
  test(layer + ": configuration stores all grades and difficulties with trusted metadata", async () => {
    const input = configuration();
    input.additionalLlmInstructions = " Common instructions \nSecond line ";
    input.gradeInstructions.primary[3] = "Primary three"; input.gradeInstructions.secondary[3] = "Secondary three";
    input.difficultyInstructions = {easy: " Simple ", medium: " Moderate ", hard: " Challenging "};
    input.updatedBy = "spoofed"; input.extra = "discard";
    const saved = await invoke(api, "saveEssayQuestionGeneratorConfig", input);
    assert.equal(saved.additionalLlmInstructions, "Common instructions \nSecond line");
    assert.equal(saved.gradeInstructions.primary[3], "Primary three");
    assert.equal(saved.gradeInstructions.secondary[3], "Secondary three");
    assert.deepEqual(saved.difficultyInstructions, {easy: "Simple", medium: "Moderate", hard: "Challenging"});
    assert.equal(saved.updatedBy, administrator.uid); assert.ok(saved.updatedAt instanceof Date);
    assert.ok(Object.isFrozen(saved.gradeInstructions.primary));
    assert.deepEqual(await api.getEssayQuestionGeneratorConfig(), saved);
    assert.deepEqual(Object.keys(documents.get(configPath)).sort(),
      ["additionalLlmInstructions", "difficultyInstructions", "gradeInstructions", "gradeWordCountRequirements", "updatedAt", "updatedBy"]);
    assert.equal(writes[0].options.merge, false);
    const cleared = await invoke(api, "saveEssayQuestionGeneratorConfig", {});
    assert.deepEqual(cleared.gradeInstructions, configuration().gradeInstructions);
  });
  test(layer + ": malformed instruction maps and nonstring instructions fail before data access", async () => {
    const invalid = [null, [], {additionalLlmInstructions: null}, {gradeInstructions: null},
      {gradeInstructions: {college: {}}}, {gradeInstructions: {primary: []}},
      {gradeInstructions: {primary: {"7": ""}}}, {gradeInstructions: {secondary: {"1": false}}},
      {difficultyInstructions: {expert: ""}}, {difficultyInstructions: {medium: 3}},
      {gradeWordCountRequirements: null}, {gradeWordCountRequirements: {college: {}}},
      {gradeWordCountRequirements: {primary: {"7": {minWords: 100}}}},
      ...[0, -1, 1.5, "150", NaN, Number.MAX_SAFE_INTEGER + 1].map(minWords =>
        ({gradeWordCountRequirements: {primary: {"1": {minWords}}}})),
      {gradeWordCountRequirements: {primary: {"1": {minWords: 100, maxWords: 200}}}}];
    for (const input of invalid) await assert.rejects(() => invoke(api, "saveEssayQuestionGeneratorConfig", input));
    assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(adminChecks, []);
  });
  test(layer + ": generation selects only the applicable instructions and atomically persists the question and index", async () => {
    const config = configuration();
    config.additionalLlmInstructions = "COMMON_MARKER";
    for (const [level, grades] of Object.entries(config.gradeInstructions)) for (const standard of Object.keys(grades)) {
      grades[standard] = level + "_GRADE_" + standard + "_MARKER";
    }
    config.difficultyInstructions = {easy: "EASY_MARKER", medium: "MEDIUM_MARKER", hard: "HARD_MARKER"};
    put(configPath, {...config, updatedAt: now, updatedBy: administrator.uid});
    const input = generation();
    const saved = await invoke(api, "generateEssayQuestion", input);
    assert.equal(llmCalls.length, 1);
    const {prompt, options} = llmCalls[0];
    assert.match(prompt, /COMMON_MARKER/); assert.match(prompt, /primary_GRADE_3_MARKER/);
    assert.match(prompt, /MEDIUM_MARKER/); assert.doesNotMatch(prompt, /EASY_MARKER|HARD_MARKER|secondary_GRADE_|primary_GRADE_[12456]_MARKER/);
    assert.ok(prompt.includes(JSON.stringify(input.seed)));
    assert.ok(prompt.includes(JSON.stringify({...scope, difficulty: "medium"})));
    assert.equal(options.useDirectFunction, layer === "web" ? true : undefined);
    assert.equal(saved.questionText, response.questionText);
    assert.equal(saved.seedUsed, input.seed); assert.equal(saved.standard, 3);
    assert.equal(saved.language, "English"); assert.ok(saved.generatedAt instanceof Date);
    const questionPath = questionCollectionPath(scope) + "/" + saved.questionId;
    assert.deepEqual(writes.map(write => write.path), [questionPath, indexPath(saved.questionId)]);
    assert.deepEqual(documents.get(indexPath(saved.questionId)), {documentPath: questionPath});
    assert.deepEqual(Object.keys(documents.get(questionPath)).sort(), ["difficulty", "generatedAt", "questionText", "seedUsed", "wordCountRequirement"]);
    assert.deepEqual(await api.getEssayQuestionById(saved.questionId), saved);
  });
  test(layer + ": grade minimums round trip independently, default to null and remain immutable on saved models", async () => {
    const saved = await invoke(api, "saveEssayQuestionGeneratorConfig", {
      gradeWordCountRequirements: {primary: {"3": {minWords: 150}}, secondary: {"3": {minWords: 350}}},
    });
    assert.deepEqual(saved.gradeWordCountRequirements.primary[3], {minWords: 150});
    assert.deepEqual(saved.gradeWordCountRequirements.secondary[3], {minWords: 350});
    assert.deepEqual(saved.gradeWordCountRequirements.primary[1], {minWords: null});
    assert.ok(Object.isFrozen(saved.gradeWordCountRequirements.primary[3]));
    assert.deepEqual((await api.getEssayQuestionGeneratorConfig()).gradeWordCountRequirements, saved.gradeWordCountRequirements);
    assert.deepEqual(Object.keys(saved.gradeWordCountRequirements.primary[3]), ["minWords"]);
  });
  test(layer + ": generation passes the selected grade minimum directly and retains that snapshot through preview and save", async () => {
    const config = configuration();
    config.gradeWordCountRequirements.primary[3].minWords = 150;
    config.gradeWordCountRequirements.secondary[3].minWords = 350;
    config.additionalLlmInstructions = "Write exactly 999 words.";
    put(configPath, {...config, updatedAt: now, updatedBy: administrator.uid});
    onLlm = () => {
      config.gradeWordCountRequirements.primary[3].minWords = 300;
      put(configPath, {...config, updatedAt: now, updatedBy: administrator.uid});
    };
    response = {questionText: "Write about friendship. Write at least 150 words.", wordCountRequirement: {minWords: 999}};
    const draft = await invoke(api, "generateEssayQuestion", generation({save: false, wordCountRequirement: {minWords: 888}}));
    assert.deepEqual(draft.wordCountRequirement, {minWords: 150});
    assert.ok(Object.isFrozen(draft.wordCountRequirement));
    assert.ok(llmCalls[0].prompt.includes('Direct essay word-count requirement:\n{"minWords":150}'));
    assert.match(llmCalls[0].prompt, /must contain at least 150 words/);
    assert.match(llmCalls[0].prompt, /Ignore essay word-count or length requirements in additional instructions or the seed/);
    assert.deepEqual(writes, []);
    const saved = await invoke(api, "saveEssayQuestion", draft);
    assert.deepEqual(saved.wordCountRequirement, {minWords: 150});
    assert.deepEqual((await api.getEssayQuestionById(saved.questionId)).wordCountRequirement, {minWords: 150});
    assert.deepEqual((await api.listEssayQuestions({...scope, limit: 5})).questions[0].wordCountRequirement, {minWords: 150});
    const writesBeforeRetry = writes.length;
    await invoke(api, "saveEssayQuestion", draft);
    assert.equal(writes.length, writesBeforeRetry);
    await assert.rejects(() => invoke(api, "saveEssayQuestion", {...draft, wordCountRequirement: {minWords: 300}}), /already exists/);
    onLlm = null;
    const next = await invoke(api, "generateEssayQuestion", generation());
    assert.deepEqual(next.wordCountRequirement, {minWords: 300});
  });
  test(layer + ": legacy config and questions read without writes and free-text counts do not supply a minimum", async () => {
    put(configPath, {additionalLlmInstructions: "Write at least 999 words.", gradeInstructions: {primary: {"3": "Essay length: 888 words."}},
      updatedAt: now, updatedBy: administrator.uid});
    assert.deepEqual((await api.getEssayQuestionGeneratorConfig()).gradeWordCountRequirements.primary[3], {minWords: null});
    seedQuestion("legacy-question");
    assert.deepEqual((await api.getEssayQuestionById("legacy-question")).wordCountRequirement, {minWords: null});
    const draft = await invoke(api, "generateEssayQuestion", generation({save: false}));
    assert.deepEqual(draft.wordCountRequirement, {minWords: null});
    assert.ok(llmCalls[0].prompt.includes('Direct essay word-count requirement:\n{"minWords":null}'));
    assert.match(llmCalls[0].prompt, /Do not include an essay word-count requirement in questionText/);
    assert.doesNotMatch(llmCalls[0].prompt, /If the applicable common, grade or difficulty instructions specify an essay word-count requirement/);
    assert.deepEqual(writes, []);
  });
  test(layer + ": default instructions and encoded Unicode languages work without writing configuration", async () => {
    const input = generation({level: "secondary", standard: 6, language: "\u4e2d\u6587/\u7b80\u4f53", seed: "  Caller seed  "});
    response = JSON.stringify({questionText: "  A question in the target language.  "});
    const saved = await invoke(api, "generateEssayQuestion", input);
    assert.equal(saved.language, input.language); assert.equal(saved.seedUsed, "Caller seed");
    assert.equal(saved.questionText, "A question in the target language.");
    assert.deepEqual(await api.getEssayQuestionById(saved.questionId), saved);
    assert.equal(documents.has(configPath), false);
    assert.ok(writes[0].path.includes(encodeURIComponent(input.language)));
    assert.equal((await api.listEssayQuestions({...input, limit: 5})).questions[0].questionId, saved.questionId);
  });
  test(layer + ": invalid generation criteria or missing seed are rejected before authorization or LLM calls", async () => {
    for (const input of [null, [], generation({level: "college"}), generation({standard: 0}), generation({standard: 7}),
      generation({standard: "3"}), generation({language: ""}), generation({language: ".."}),
      generation({difficulty: undefined}), generation({difficulty: "expert"}), generation({seed: undefined}),
      generation({seed: " "}), generation({seed: 5}), generation({save: "false"}), generation({save: null})]) {
      await assert.rejects(() => invoke(api, "generateEssayQuestion", input));
    }
    assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []); assert.deepEqual(adminChecks, []);
  });
  test(layer + ": previews never write and can be saved explicitly without another LLM call", async () => {
    const draft = await invoke(api, "generateEssayQuestion", generation({save: false}));
    assert.equal(draft.questionText, response.questionText); assert.equal(draft.seedUsed, generation().seed);
    assert.ok(draft.questionId); assert.equal(Object.hasOwn(draft, "generatedAt"), false);
    assert.deepEqual(writes, []); assert.equal(documents.size, 0);
    assert.equal(await api.getEssayQuestionById(draft.questionId), null);
    assert.deepEqual((await api.listEssayQuestions({...scope, limit: 5})).questions, []);
    const saved = await invoke(api, "saveEssayQuestion", draft);
    assert.equal(saved.questionId, draft.questionId); assert.ok(saved.generatedAt instanceof Date);
    assert.deepEqual(await api.getEssayQuestionById(saved.questionId), saved);
    assert.equal(writes.length, 2); assert.equal(llmCalls.length, 1);
    assert.deepEqual(await invoke(api, "saveEssayQuestion", draft), saved);
    assert.equal(writes.length, 2); assert.equal(llmCalls.length, 1);
    await assert.rejects(() => invoke(api, "saveEssayQuestion", {...draft, questionText: "Changed question"}), /already exists/);
    await assert.rejects(() => invoke(api, "saveEssayQuestion", {...draft, standard: 4}), /already exists/);
    assert.equal(writes.length, 2);
  });
  test(layer + ": saving a draft can safely retry a failed response after its transaction committed", async () => {
    const draft = questionDraft(); const path = questionCollectionPath(scope) + "/" + draft.questionId;
    let questionReads = 0;
    onRead = target => {if (target === path && ++questionReads === 2) throw new Error("Response unavailable");};
    await assert.rejects(() => invoke(api, "saveEssayQuestion", draft), /Response unavailable/);
    assert.equal(documents.size, 2); assert.equal(writes.length, 2);
    onRead = null;
    const saved = await invoke(api, "saveEssayQuestion", draft);
    assert.equal(saved.questionId, draft.questionId); assert.equal(writes.length, 2);
    assert.deepEqual(llmCalls, []);
  });
  test(layer + ": invalid drafts fail before authorization and save failures leave no partial records", async () => {
    for (const draft of [null, questionDraft({questionId: undefined}), questionDraft({questionText: " "}),
      questionDraft({seedUsed: ""}), questionDraft({difficulty: "expert"})]) {
      await assert.rejects(() => invoke(api, "saveEssayQuestion", draft));
    }
    assert.deepEqual(adminChecks, []); assert.deepEqual(reads, []); assert.deepEqual(writes, []);
    writeFailure = new Error("Commit unavailable");
    await assert.rejects(() => invoke(api, "saveEssayQuestion", questionDraft()), /Commit unavailable/);
    assert.equal(documents.size, 0);
    writeFailure = null;
    assert.equal((await invoke(api, "saveEssayQuestion", questionDraft())).questionId, "preview-id");
  });
  test(layer + ": changing caller inputs during generation cannot turn a preview into an automatic save", async () => {
    const input = generation({save: false});
    onLlm = () => {input.save = true; input.seed = "Changed";};
    const draft = await invoke(api, "generateEssayQuestion", input);
    assert.equal(draft.seedUsed, generation().seed); assert.equal(documents.size, 0); assert.deepEqual(writes, []);
  });
  test(layer + ": malformed or failed LLM responses never create question or index documents", async () => {
    for (const value of ["Not JSON", null, [], {}, {questionText: ""}, {questionText: 4}, new Error("AI unavailable")]) {
      response = value;
      await assert.rejects(() => invoke(api, "generateEssayQuestion", generation()));
      assert.equal(documents.size, 0); assert.deepEqual(writes, []);
    }
  });
  test(layer + ": storage failures do not partially save a question or its lookup", async () => {
    writeFailure = new Error("Commit unavailable");
    await assert.rejects(() => invoke(api, "generateEssayQuestion", generation()), /Commit unavailable/);
    assert.equal(documents.size, 0); assert.deepEqual(writes, []);
    writeFailure = null;
    assert.ok((await invoke(api, "generateEssayQuestion", generation())).questionId);
  });
  test(layer + ": an existing globally indexed ID is never overwritten", async () => {
    const id = "00000000000000000001";
    seedQuestion(id, {...scope, standard: 4});
    await assert.rejects(() => invoke(api, "generateEssayQuestion", generation()), /already exists/);
    assert.equal(documents.size, 2); assert.deepEqual(writes, []);
  });
  test(layer + ": corrupt stored configuration stops generation instead of silently replacing settings", async () => {
    put(configPath, {additionalLlmInstructions: "", updatedAt: null, updatedBy: administrator.uid});
    await assert.rejects(() => api.getEssayQuestionGeneratorConfig(), /timestamp/);
    await assert.rejects(() => invoke(api, "generateEssayQuestion", generation()), /timestamp/);
    assert.deepEqual(llmCalls, []); assert.deepEqual(writes, []);
    readFailurePath = configPath;
    await assert.rejects(() => api.getEssayQuestionGeneratorConfig(), /Read unavailable/);
  });
  test(layer + ": ID lookup validates stored paths before reading question data", async () => {
    for (const path of ["students/secret", "essayQuestionGenerator/config", questionCollectionPath(scope) + "/different",
      "essayQuestionGenerator/primary/standards/03/languages/English/questions/known"]) {
      put(indexPath("known"), {documentPath: path});
      await assert.rejects(() => api.getEssayQuestionById("known"));
      assert.ok(!reads.includes(path));
    }
    for (const id of ["", "../secret", "some/path", null]) await assert.rejects(() => api.getEssayQuestionById(id));
    const path = seedQuestion("known"); documents.delete(path);
    await assert.rejects(() => api.getEssayQuestionById("known"), /could not be found/);
  });
  test(layer + ": listing returns complete scoped questions with stable pagination and an optional difficulty filter", async () => {
    seedQuestion("a", scope, {difficulty: "easy"});
    seedQuestion("b"); seedQuestion("c"); seedQuestion("d", scope, {difficulty: "hard"});
    seedQuestion("other-grade", {...scope, standard: 4}); seedQuestion("other-language", {...scope, language: "Malay"});
    const first = await api.listEssayQuestions({...scope, limit: 2});
    assert.deepEqual(first.questions.map(question => question.questionId), ["a", "b"]); assert.ok(first.nextCursor);
    assert.equal(first.questions[0].questionText, questionData().questionText);
    documents.delete(questionCollectionPath(scope) + "/b");
    const second = await api.listEssayQuestions({...scope, limit: 2, cursor: first.nextCursor});
    assert.deepEqual(second.questions.map(question => question.questionId), ["c", "d"]); assert.equal(second.nextCursor, null);
    const medium = await api.listEssayQuestions({...scope, difficulty: "medium", limit: 1});
    assert.deepEqual(medium.questions.map(question => question.questionId), ["c"]); assert.equal(medium.nextCursor, null);
    assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []);
  });
  test(layer + ": invalid pagination and cursors from different criteria fail before querying", async () => {
    const cursor = encodeCursor(scope, "a");
    for (const input of [{...scope, limit: 0}, {...scope, limit: 1.5}, {...scope, limit: "2"},
      {...scope, limit: 2, cursor: "invalid"}, {...scope, limit: 2, cursor: "%"},
      {...scope, standard: 4, limit: 2, cursor}, {...scope, difficulty: "easy", limit: 2, cursor},
      {...scope, language: "Malay", limit: 2, cursor}]) {
      await assert.rejects(() => api.listEssayQuestions(input));
    }
    assert.deepEqual(reads, []); assert.deepEqual(writes, []);
  });
  test(layer + ": random selection includes every matching question across page boundaries without an LLM call", async () => {
    for (let index = 1; index <= 205; index++) seedQuestion("q" + String(index).padStart(3, "0"));
    seedQuestion("excluded-hard", scope, {difficulty: "hard"});
    const repository = {listQuestions: input => api.listEssayQuestions(input)};
    const last = await new Random(repository, () => 0).execute({...scope, difficulty: "medium"});
    assert.equal(last.questionId, "q205");
    const first = await new Random(repository, () => 0.999999).execute({...scope, difficulty: "medium"});
    assert.equal(first.questionId, "q001"); assert.ok(queries.length >= 6);
    await assert.rejects(() => new Random(repository, () => NaN).execute(scope), /random/);
    const selected = await api.getRandomEssayQuestion({...scope, difficulty: "hard"});
    assert.equal(selected.questionId, "excluded-hard");
    assert.equal(await api.getRandomEssayQuestion({...scope, difficulty: "easy"}), null);
    assert.deepEqual(llmCalls, []); assert.deepEqual(writes, []);
  });
  test(layer + ": async authorization cannot mutate the original generation or configuration inputs", async () => {
    const input = generation(); const config = configuration(); config.gradeInstructions.primary[3] = "Original grade";
    onAdminCheck = () => {input.seed = "Changed"; input.standard = 1; config.gradeInstructions.primary[3] = "Changed grade";};
    if (layer === "backend") {
      onLlm = () => {input.seed = "Changed"; input.standard = 1;};
    }
    const saved = await invoke(api, "generateEssayQuestion", input);
    assert.equal(saved.standard, 3); assert.equal(saved.seedUsed, generation().seed);
    config.gradeInstructions.primary[3] = "Original grade";
    if (layer === "backend") onRead = path => {if (path === configPath) config.gradeInstructions.primary[3] = "Changed grade";};
    const savedConfig = await invoke(api, "saveEssayQuestionGeneratorConfig", config);
    assert.equal(savedConfig.gradeInstructions.primary[3], "Original grade");
  });
}

test("backend writes and generation require trusted administrator context", async () => {
  for (const context of [undefined, {}, {updatedBy: ""}]) {
    await assert.rejects(() => backend.saveEssayQuestionGeneratorConfig(configuration(), context), /updatedBy/);
    await assert.rejects(() => backend.generateEssayQuestion(generation(), context), /updatedBy/);
    await assert.rejects(() => backend.saveEssayQuestion(questionDraft(), context), /updatedBy/);
  }
  assert.deepEqual(writes, []); assert.deepEqual(reads, []); assert.deepEqual(llmCalls, []);
});
test("all web APIs require sign-in; students can read but cannot save config or generate questions", async () => {
  const inputs = {saveEssayQuestionGeneratorConfig: configuration(), generateEssayQuestion: generation(),
    saveEssayQuestion: questionDraft(),
    getEssayQuestionById: "known", listEssayQuestions: {...scope, limit: 2}, getRandomEssayQuestion: scope};
  auth.currentUser = null;
  for (const name of apis) await assert.rejects(() => web[name](inputs[name]), /authenticated/);
  auth.currentUser = {uid: "student", email: "student@example.com", emailVerified: true};
  await assert.rejects(() => web.saveEssayQuestionGeneratorConfig(configuration()));
  await assert.rejects(() => web.generateEssayQuestion(generation()));
  await assert.rejects(() => web.saveEssayQuestion(questionDraft()));
  seedQuestion("known");
  assert.equal((await web.getEssayQuestionById("known")).questionId, "known");
  assert.equal((await web.listEssayQuestions({...scope, limit: 2})).questions.length, 1);
  assert.equal((await web.getRandomEssayQuestion(scope)).questionId, "known");
  assert.deepEqual(writes, []); assert.deepEqual(llmCalls, []);
});
test("web rejects account changes during administrator checks, LLM work and transaction reads", async () => {
  const switchUser = () => {auth.currentUser = {uid: "other", email: "other@example.com", emailVerified: true};};
  onAdminCheck = switchUser;
  await assert.rejects(() => web.generateEssayQuestion(generation()), /changed/);
  assert.deepEqual(reads, []);
  onAdminCheck = null; auth.currentUser = {...administrator}; onLlm = switchUser;
  await assert.rejects(() => web.generateEssayQuestion(generation()), /changed/);
  assert.deepEqual(writes, []);
  onLlm = null; auth.currentUser = {...administrator}; onTransactionRead = switchUser;
  await assert.rejects(() => web.generateEssayQuestion(generation()), /changed/);
  assert.deepEqual(writes, []); assert.equal(documents.size, 0);
});
test("web rejects changed accounts during reads and stops random sampling after the current page", async () => {
  seedQuestion("known");
  onRead = () => {auth.currentUser = {...administrator, uid: "other"};};
  for (const operation of [() => web.getEssayQuestionGeneratorConfig(), () => web.getEssayQuestionById("known"),
    () => web.listEssayQuestions({...scope, limit: 1}), () => web.getRandomEssayQuestion(scope)]) {
    auth.currentUser = {...administrator};
    await assert.rejects(operation, /changed/);
  }
  assert.deepEqual(writes, []);
});
