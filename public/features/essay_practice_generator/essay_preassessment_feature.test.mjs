import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import * as web from "./essay_practice_generator_module.js";
import * as webPractice from "../essay_practice/essay_practice_module.js";
import * as webSyllabus from "../syllabus/syllabus_module.js";
import * as webSchema from "../../config/firebase/syllabuses_schema.js";
import * as webPracticeSchema from "../../config/firebase/essay_practice_schema.js";
import * as webLlm from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import * as webNextEssay from "../student_essay_practice_generator/student_essay_practice_generator_module.js";
import {GeneratePreAssessmentPractice} from "../practice_generator/application/generate_pre_assessment_practice.js";
import {LoadPreAssessmentGeneratorOptions} from "../practice_generator/application/load_pre_assessment_generator_options.js";

const require = createRequire(import.meta.url);
const ops = require("../../../functions/utils/firebase/firebase_ops");
const backendLlm = require("../../../functions/utils/llm/llm_ops");
const originalOps = {...ops}, originalLlm = backendLlm.generateLlmText, originalFirebase = globalThis.firebase;
const originalAdapter = new webLlm.LlmUtil().getProviderAdapter("deepseek");
const docs = new Map(), versions = new Map(), reads = [], writes = [], llmCalls = [];
const now = new Date("2026-10-18T10:00:00Z");
const administrator = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...administrator}};
let autoId = 0, onRead, onLlm, failWritePath, response;
function put(path, data) {docs.set(path, structuredClone(data)); versions.set(path, (versions.get(path) ?? 0) + 1);}
function snap(path) {
  const exists = docs.has(path), data = exists ? structuredClone(docs.get(path)) : undefined;
  return {exists, id: path.split("/").at(-1), data: () => structuredClone(data)};
}
async function read(path) {reads.push(path); const result = snap(path); await onRead?.(path); return result;}
function merge(first, second) {
  const result = {...first};
  for (const [key, value] of Object.entries(second)) {
    result[key] = value && Object.getPrototypeOf(value) === Object.prototype ? merge(result[key], value) : value;
  }
  return result;
}
function save(path, input, options) {
  if (path === failWritePath) throw new Error("Write unavailable");
  const data = {...input};
  for (const key of ["generatedAt", "assignedAt", "completedAt", "updatedAt", "scoredAt", "savedAt"]) {
    if (Object.hasOwn(data, key) && !(data[key] instanceof Date)) data[key] = now;
  }
  writes.push({path, data: structuredClone(data), options});
  put(path, options?.merge ? merge(docs.get(path), data) : data);
}
function ref(path) {
  return {path, id: path.split("/").at(-1), collection: name => collection(path + "/" + name),
    get: () => read(path), set: async (data, options) => save(path, data, options),
    async update(data) {if (!docs.has(path)) throw new Error("Missing document"); save(path, data, {merge: true});}};
}
function collection(path, criteria = {}) {
  return {
    doc: id => ref(path + "/" + (id ?? "auto-" + (++autoId))),
    where: (field, operator, value) => {
      assert.equal(operator, "==");
      return collection(path, {...criteria, filters: [...(criteria.filters ?? []), [field, value]]});
    },
    orderBy: () => collection(path, {...criteria, ordered: true}),
    startAfter: id => collection(path, {...criteria, after: id}),
    limit: limit => collection(path, {...criteria, limit}),
    async get() {
      reads.push(path); const prefix = path + "/";
      let paths = [...docs.keys()].filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .filter(key => (criteria.filters ?? []).every(([field, value]) => docs.get(key)[field] === value));
      if (criteria.ordered) paths.sort();
      if (criteria.after) paths = paths.filter(key => key.slice(prefix.length) > criteria.after);
      if (criteria.limit) paths = paths.slice(0, criteria.limit);
      return {docs: paths.map(snap)};
    },
  };
}
const db = {
  collection, doc: ref,
  async runTransaction(operation) {
    for (let retry = 0; retry < 8; retry++) {
      const pending = [], observed = new Map();
      const result = await operation({
        async get(reference) {
          assert.equal(pending.length, 0);
          observed.set(reference.path, versions.get(reference.path) ?? 0);
          return reference.get();
        },
        set: (reference, data, options) => pending.push({reference, data, options}),
        update: (reference, data) => pending.push({reference, data, options: {merge: true}}),
        delete: reference => pending.push({reference, remove: true}),
      });
      if ([...observed].some(([path, version]) => (versions.get(path) ?? 0) !== version)) continue;
      if (pending.some(item => item.reference.path === failWritePath)) throw new Error("Write unavailable");
      for (const {reference, data, options, remove} of pending) {
        if (remove) {docs.delete(reference.path); versions.set(reference.path, (versions.get(reference.path) ?? 0) + 1);}
        else save(reference.path, data, options);
      }
      return result;
    }
    throw new Error("Transaction conflict");
  },
};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "SERVER"};
firestore.FieldPath = {documentId: () => "__name__"};
const app = {firestore: () => db, auth: () => auth, functions: () => ({httpsCallable(name) {
  assert.equal(name, "isCurrentUserSiteAdmin", "Only the existing admin check may use a callable.");
  return async () => ({data: {email: auth.currentUser?.email ?? null,
    emailVerified: auth.currentUser?.emailVerified === true, isAdmin: auth.currentUser?.uid === administrator.uid}});
}})};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
ops.getFirestoreDb = () => db;
ops.getDocumentRef = (path, id) => ref(path + "/" + id);
ops.getCollectionRef = collection;
ops.readDocument = async (path, id, options) => {
  const result = await read(path + "/" + id);
  return result.exists ? {...result.data(), ...(options?.includeId === false ? {} : {id})} : null;
};
ops.readCollection = async path => (await collection(path).get()).docs.map(doc => ({...doc.data(), id: doc.id}));
ops.readCollectionIds = async path => (await collection(path).get()).docs.map(doc => doc.id);
ops.writeDocument = async (path, id, data, options) => save(path + "/" + id, data, options);
async function generateLlmText(prompt, options) {
  llmCalls.push({prompt, options}); await onLlm?.();
  if (response instanceof Error) throw response;
  if (typeof response === "function") return response(prompt, options);
  return response;
}
backendLlm.generateLlmText = generateLlmText;
webLlm.registerLlmProvider("deepseek", {call() {throw new Error("Use generation");}, generateText: generateLlmText});
const backend = require("../../../functions/features/essay_practice_generator/essay_practice_generator_module");
const backendPractice = require("../../../functions/features/essay_practice/essay_practice_module");
const backendSyllabus = require("../../../functions/features/syllabus/syllabus_module");
const backendSchema = require("../../../functions/schema/syllabuses_schema");
const backendPracticeSchema = require("../../../functions/schema/essay_practice_schema");
const studentEssay = require("../../../functions/features/student_essay_practice/student_essay_practice_module");
const backendNextEssay = require("../../../functions/features/student_essay_practice_generator/student_essay_practice_generator_module");
const backendReadiness = require("../../../functions/features/readiness/readiness_module");
const backendReliability = require("../../../functions/features/reliability/reliability_module");
const {scoreCompletedStudentEssay} = require("../../../functions/triggers/student_essay_practice_completion_trigger");
const {assignSubscriptionPreAssessmentPractices, subscriptionEssayAttemptId} = require("../../../functions/triggers/syllabus_subscription_trigger");
const topicPath = "syllabuses/syllabus-1/topics/topic-1";
const selection = changes => ({syllabusId: "syllabus-1", topicId: "topic-1", language: "english", ...changes});
const trusted = {updatedBy: administrator.uid};
function seed() {
  put("syllabuses/syllabus-1", {country: "Malaysia", level: "primary", year: 3, subject: "English", languages: ["English", "Malay"], active: true});
  put(topicPath, {topicName: "Writing", pausable: false, subtopics: {sub: "Stories"}});
  put("questionSeedGenerator/theme", {entries: [
    {value: "Helping a neighbour", associations: {primary: [3]}},
    {value: "WRONG_GRADE", associations: {secondary: [6]}},
  ]});
}
beforeEach(() => {
  docs.clear(); versions.clear(); reads.length = writes.length = llmCalls.length = 0;
  autoId = 0; onRead = onLlm = failWritePath = null;
  response = {questionText: "Write about helping a neighbour."};
  auth.currentUser = {...administrator}; seed();
});
after(() => {
  Object.assign(ops, originalOps); backendLlm.generateLlmText = originalLlm;
  webLlm.registerLlmProvider("deepseek", originalAdapter);
  if (originalFirebase === undefined) delete globalThis.firebase; else globalThis.firebase = originalFirebase;
});

for (const [layer, firstEssayApi, nextEssayApi] of [["backend", backend, backendNextEssay], ["web", web, webNextEssay]]) {
  test(layer + ": next essay generator uses existing feature APIs to save and assign once without replacing the syllabus attachment", async () => {
    const first = await firstEssayApi.generateEssayPractice(selection(), trusted);
    await studentEssay.assignEssayPracticeToStudent({studentId: "student", essayPracticeId: "initial-essay",
      essayQuestionId: first.question.questionId, syllabusId: "syllabus-1", topicId: "topic-1"});
    await studentEssay.completeAssignedEssayPractice({studentId: "student", essayPracticeId: "initial-essay",
      essayText: "My submitted essay.", timeTakenSeconds: 30});
    const originalAttachment = structuredClone(docs.get(topicPath));
    reads.length = 0;
    const input = {studentId: "student", completedEssayPracticeId: "initial-essay"};
    const next = await nextEssayApi.generateNextStudentEssayPractice(input, trusted);
    assert.notEqual(next.essayQuestionId, first.question.questionId);
    assert.equal(next.syllabusId, "syllabus-1"); assert.equal(next.topicId, "topic-1");
    assert.equal(docs.get("studentEssayPractices/student/assignedEssayPractices/" + next.essayPracticeId).essayQuestionId, next.essayQuestionId);
    assert.equal(reads.filter(path => path === "questionSeedGenerator/theme").length, 1, "The full eligible theme pool is read once");
    const questionPath = docs.get("essayQuestionGenerator/questionIndex/entries/" + next.essayQuestionId).documentPath;
    assert.equal(docs.get(questionPath).seedUsed, "latest news", "Exhausted eligible themes use the question-seed default");
    assert.equal(llmCalls.length, 2);
    assert.deepEqual(docs.get(topicPath), originalAttachment);
    assert.equal([...docs.keys()].filter(path => path.startsWith("essayPractices/")).length, 1);
    const state = docs.get("studentEssayPracticeGenerations/student/completions/initial-essay");
    assert.equal(state.status, "completed"); assert.equal(state.nextEssayPracticeId, next.essayPracticeId);
    assert.equal(state.essayQuestionId, next.essayQuestionId); assert.equal(state.draft, undefined);
    assert.deepEqual(await nextEssayApi.generateNextStudentEssayPractice(input, trusted), next);
    await studentEssay.completeAssignedEssayPractice({studentId: "student", essayPracticeId: next.essayPracticeId,
      essayText: "My next submitted essay.", timeTakenSeconds: 40});
    assert.equal((await nextEssayApi.generateNextStudentEssayPractice(input, trusted)).essayText, "My next submitted essay.");
    assert.equal(docs.has("studentEssayPractices/student/assignedEssayPractices/" + next.essayPracticeId), false);
    assert.equal(llmCalls.length, 2);
  });
}

test("next essay web API rejects non-admins and changed accounts before assignment", async () => {
  const input = {studentId: "student", completedEssayPracticeId: "initial-essay"};
  auth.currentUser = {...administrator, uid: "student"};
  await assert.rejects(() => webNextEssay.generateNextStudentEssayPractice(input), /site administrator/);
  assert.equal(writes.length, 0);
  auth.currentUser = {...administrator};
  const first = await web.generateEssayPractice(selection());
  await studentEssay.assignEssayPracticeToStudent({studentId: "student", essayPracticeId: "initial-essay",
    essayQuestionId: first.question.questionId, syllabusId: "syllabus-1", topicId: "topic-1"});
  await studentEssay.completeAssignedEssayPractice({studentId: "student", essayPracticeId: "initial-essay",
    essayText: "My submitted essay.", timeTakenSeconds: 30});
  onLlm = () => {auth.currentUser = null;};
  await assert.rejects(() => webNextEssay.generateNextStudentEssayPractice(input), /authenticated/);
  assert.equal([...docs.keys()].filter(path => path.startsWith("studentEssayPractices/student/assignedEssayPractices/")).length, 0);
});

test("essay completion saves topic and subject metrics and retries failed generation without regrading or duplicate readiness history", async () => {
  const first = await backend.generateEssayPractice(selection(), trusted);
  put("syllabuses/syllabus-1/topics/untouched", {topicName: "Untouched topic", pausable: false});
  put("readinessConfigs/default", {difficultyWeights: {easy: 0.75, medium: 1, hard: 1.75},
    numberOfPractices: 5, preAssessmentWeight: 1, updatedAt: now, updatedBy: administrator.uid});
  await studentEssay.assignEssayPracticeToStudent({studentId: "student", essayPracticeId: "initial-essay",
    essayQuestionId: first.question.questionId, syllabusId: "syllabus-1", topicId: "topic-1"});
  await studentEssay.completeAssignedEssayPractice({studentId: "student", essayPracticeId: "initial-essay",
    essayText: "My submitted essay.", timeTakenSeconds: 30});
  response = prompt => prompt.includes("You are an essay marker")
    ? {score: 80, reviewComment: "Your example is clear. Develop your final idea.", corrections: []}
    : {questionText: "Write another essay about helping a neighbour."};
  const input = {studentId: "student", essayPracticeId: "initial-essay"};
  const metricsScope = {studentId: "student", syllabusId: "syllabus-1", topicId: "topic-1"};
  const reward = async () => {};
  await assert.rejects(() => scoreCompletedStudentEssay(input, {awardDailyMission: reward,
    generateNextEssay: async () => {throw new Error("Temporary generation failure");}}), /Temporary generation failure/);
  assert.equal((await backendReadiness.getReadinessScore(metricsScope)).score, 80);
  assert.equal((await backendReadiness.getSubjectReadinessScore(metricsScope)).score, 80);
  assert.equal((await backendReliability.getTopicReliabilityScore(metricsScope)).score, 10);
  assert.equal((await backendReliability.getSubjectReliabilityScore(metricsScope)).score, 5);
  assert.equal(docs.get("studentEssayPractices/student/completedEssayPractices/initial-essay").scoring.status, "completed");
  await scoreCompletedStudentEssay(input, {awardDailyMission: reward});
  await scoreCompletedStudentEssay(input, {awardDailyMission: reward});
  const gradingCalls = llmCalls.filter(call => call.prompt.includes("You are an essay marker"));
  assert.equal(gradingCalls.length, 1);
  assert.equal(llmCalls.length, 3, "One first essay, one grade and one next essay are generated");
  const generation = docs.get("studentEssayPracticeGenerations/student/completions/initial-essay");
  assert.equal(generation.status, "completed");
  assert.equal((await studentEssay.listAssignedEssayPractices({studentId: "student", limit: 100})).practices.length, 1);
  for (const read of [backendReadiness.getReadinessScoreHistory, backendReadiness.getSubjectReadinessScoreHistory]) {
    const history = await read(metricsScope);
    assert.equal(history.length, 1);
    assert.equal(history[0].practiceId, "initial-essay"); assert.equal(history[0].practiceType, "essay");
  }
  assert.equal((await backendReliability.getTopicReliabilityScore(metricsScope)).completedPracticeCount, 1);
});

test("backend/web schemas and normal/essay enums match", () => {
  for (const key of Object.keys(backendSchema)) assert.deepEqual(webSchema[key], backendSchema[key]);
  for (const key of Object.keys(backendPracticeSchema)) assert.deepEqual(webPracticeSchema[key], backendPracticeSchema[key]);
  assert.deepEqual(backendSyllabus.preAssessmentPracticeTypes, {NORMAL: "normal", ESSAY: "essay"});
  assert.deepEqual(webPracticeSchema.essayPracticeSchema.fields, {essayQuestionId: "string"});
});

for (const [layer, api, practice, syllabus] of [
  ["backend", backend, backendPractice, backendSyllabus], ["web", web, webPractice, webSyllabus],
]) {
  const generate = input => layer === "backend" ? api.generateEssayPractice(input, trusted) : api.generateEssayPractice(input);
  test(layer + ": generation saves one question and shared practice, attaches to the syllabus and never assigns a student", async () => {
    const result = await generate(selection({difficulty: "hard", studentId: "ignored"}));
    assert.equal(result.practiceType, "essay"); assert.equal(result.question.difficulty, "medium");
    assert.equal(result.question.level, "primary"); assert.equal(result.question.standard, 3);
    assert.equal(result.question.seedUsed, "Helping a neighbour");
    assert.equal(result.practice.essayQuestionId, result.question.questionId);
    assert.deepEqual(docs.get("essayPractices/" + result.practice.id), {essayQuestionId: result.question.questionId});
    assert.deepEqual(docs.get(topicPath).preAssessmentPractices.english,
      {language: "English", practiceId: result.practice.id, practiceType: "essay"});
    assert.equal(docs.get(topicPath).pausable, false); assert.deepEqual(docs.get(topicPath).subtopics, {sub: "Stories"});
    assert.ok(writes.every(item => !/studentPractices|studentEssayPractices/.test(item.path)));
    assert.ok(reads.every(path => !/assessmentFramework|diagramConfig/.test(path)));
    assert.equal(llmCalls.length, 1);
    assert.deepEqual((await api.loadEssayPractice(selection())).practice, result.practice);
    assert.deepEqual((await practice.getEssayPracticeById(result.practice.id)), result.practice);
  });

  test(layer + ": typed attachment writes preserve other languages and topic fields", async () => {
    await syllabus.assignTopicPreAssessmentPractice("syllabus-1", "topic-1", "Malay", "normal-malay");
    await syllabus.assignTopicPreAssessmentPractice("syllabus-1", "topic-1", "English", "essay-english", "essay");
    const result = await syllabus.getSyllabusById("syllabus-1");
    const topic = result.topics[0];
    assert.equal(topic.getPreAssessmentPractice("Malay").practiceType, "normal");
    assert.equal(topic.getPreAssessmentPractice("English").practiceType, "essay");
    assert.equal(topic.pausable, false); assert.deepEqual({...topic.subtopics}, {sub: "Stories"});
    const count = writes.length;
    await assert.rejects(() => syllabus.assignTopicPreAssessmentPractice("syllabus-1", "topic-1", "English", "p", "invalid"), /practiceType/);
    await assert.rejects(() => syllabus.assignTopicPreAssessmentPractice("syllabus-1", "missing", "English", "p", "essay"), /topic could not be found/);
    await assert.rejects(() => syllabus.assignTopicPreAssessmentPractice("syllabus-1", "topic-1", "French", "p", "essay"), /Language/);
    assert.equal(writes.length, count);
  });

  test(layer + ": legacy attachments default to normal and switching types replaces only that language", async () => {
    put(topicPath, {...docs.get(topicPath), preAssessmentPractices: {english: {language: "English", practiceId: "legacy"}}});
    assert.equal((await syllabus.getSyllabusById("syllabus-1")).topics[0].getPreAssessmentPractice("English").practiceType, "normal");
    const result = await generate(selection());
    assert.equal(docs.get(topicPath).preAssessmentPractices.english.practiceType, "essay");
    await syllabus.assignTopicPreAssessmentPractice("syllabus-1", "topic-1", "English", "new-normal");
    assert.equal(docs.get(topicPath).preAssessmentPractices.english.practiceType, "normal");
    assert.equal(docs.get(topicPath).preAssessmentPractices.english.practiceId, "new-normal");
    assert.ok(docs.has("essayPractices/" + result.practice.id));
  });

  test(layer + ": regeneration retains the previous essay and question for assigned students", async () => {
    const first = await generate(selection()), second = await generate(selection());
    assert.notEqual(first.practice.id, second.practice.id);
    assert.equal(second.replacement.previousPracticeId, first.practice.id);
    assert.equal(second.replacement.replaced, true);
    assert.ok(await practice.getEssayPracticeById(first.practice.id));
    assert.equal(docs.get(topicPath).preAssessmentPractices.english.practiceId, second.practice.id);
  });

  test(layer + ": invalid selections and an empty matching seed pool fail before LLM or writes", async () => {
    for (const input of [null, selection({syllabusId: ""}), selection({topicId: "a/b"}), selection({topicId: "missing"}), selection({language: "French"})]) {
      await assert.rejects(() => generate(input));
    }
    put("questionSeedGenerator/theme", {entries: [{value: "Not this grade", associations: {primary: [4]}}]});
    await assert.rejects(() => generate(selection()), /theme|entries/i);
    assert.deepEqual(llmCalls, []); assert.deepEqual(writes, []);
  });

  test(layer + ": missing questions cannot become shared practices and reads never create defaults", async () => {
    assert.equal(await practice.getEssayPracticeById("missing"), null);
    assert.equal(await api.loadEssayPractice(selection()), null);
    await assert.rejects(() => practice.createEssayPractice({essayQuestionId: "missing"}), /could not be found/);
    await assert.rejects(() => practice.createEssayPractice({essayQuestionId: ["a", "b"]}), /essayQuestionId/);
    assert.deepEqual(writes, []);
  });

  test(layer + ": generation and attachment failures preserve the existing syllabus attachment", async () => {
    await syllabus.assignTopicPreAssessmentPractice("syllabus-1", "topic-1", "English", "previous-normal");
    const before = structuredClone(docs.get(topicPath));
    response = new Error("AI unavailable");
    await assert.rejects(() => generate(selection()), /AI unavailable/);
    assert.deepEqual(docs.get(topicPath), before);
    response = {questionText: "A new essay question."}; failWritePath = topicPath;
    await assert.rejects(() => generate(selection()), /Write unavailable/);
    assert.deepEqual(docs.get(topicPath), before);
  });
}

test("subscription routes mixed topics to normal and essay assignment, safely retries and preserves completed essays", async () => {
  const generated = await backend.generateEssayPractice(selection(), trusted);
  put("syllabuses/syllabus-1/topics/topic-2", {topicName: "Reading", preAssessmentPractices: {
    english: {language: "English", practiceId: "normal-1"},
  }});
  put("practices/normal-1", {type: "pre assessment", dateGenerated: now,
    questions: [{syllabusId: "syllabus-1", topicId: "topic-2", questionId: "normal-question"}]});
  const input = {studentId: "student-1", syllabusId: "syllabus-1", language: "English"};
  await Promise.all([assignSubscriptionPreAssessmentPractices(input), assignSubscriptionPreAssessmentPractices(input)]);
  const id = subscriptionEssayAttemptId("syllabus-1", "topic-1", generated.practice.id);
  const assigned = "studentEssayPractices/student-1/assignedEssayPractices/" + id;
  assert.ok(docs.has("studentPractices/student-1/assignedPractices/normal-1"));
  assert.equal(docs.get(assigned).essayQuestionId, generated.question.questionId);
  assert.equal(writes.filter(item => item.path === assigned).length, 1);
  await studentEssay.completeAssignedEssayPractice({studentId: "student-1", essayPracticeId: id, essayText: "My essay.", timeTakenSeconds: 60});
  await assignSubscriptionPreAssessmentPractices(input);
  assert.equal(docs.has(assigned), false);
  assert.ok(docs.has("studentEssayPractices/student-1/completedEssayPractices/" + id));
});

test("subscription validates all essay attachments before writing any student assignments", async () => {
  put(topicPath, {...docs.get(topicPath), preAssessmentPractices: {english: {
    language: "English", practiceId: "missing-essay", practiceType: "essay",
  }}});
  put("syllabuses/syllabus-1/topics/topic-2", {topicName: "Normal", preAssessmentPractices: {
    english: {language: "English", practiceId: "normal-1"},
  }});
  await assert.rejects(() => assignSubscriptionPreAssessmentPractices({studentId: "student-1", syllabusId: "syllabus-1", language: "English"}), /Essay practice.*not found/);
  assert.deepEqual(writes, []);
});

test("subscription rejects missing topic/language attachments and unknown types without assignments", async () => {
  await assert.rejects(() => assignSubscriptionPreAssessmentPractices({studentId: "student-1", syllabusId: "syllabus-1", language: "English"}), /No English/);
  put(topicPath, {...docs.get(topicPath), preAssessmentPractices: {english: {language: "English", practiceId: "p", practiceType: "unknown"}}});
  await assert.rejects(() => assignSubscriptionPreAssessmentPractices({studentId: "student-1", syllabusId: "syllabus-1", language: "English"}), /practiceType/);
  assert.deepEqual(writes, []);
});

test("normal regeneration can replace an essay attachment without loading or deleting it as a normal practice", async () => {
  const calls = [], context = {syllabus: {id: "s"}, topic: {id: "t", topicName: "Writing"}, language: "English",
    existingAssignment: {practiceId: "essay-old", practiceType: "essay"}};
  const useCase = new GeneratePreAssessmentPractice({
    loadPreAssessmentContext: async () => context,
    generatePreAssessmentQuestions: async () => ({questions: [{id: "q", syllabusId: "s", topicId: "t"}], allocation: {totalQuestions: 1}}),
    createPractice: async input => ({id: "normal-new", ...input}),
    getPracticeById: async () => {throw new Error("Do not load essay as normal");},
    deletePractice: async () => {throw new Error("Do not delete essay as normal");},
    deletePreAssessmentQuestion: async () => {throw new Error("Do not delete essay question");},
    assignTopicPreAssessmentPractice: async (...args) => {calls.push(args); return {language: "English", practiceId: "normal-new", practiceType: "normal"};},
    preAssessmentPracticeType: "pre assessment",
  });
  const result = await useCase.execute({});
  assert.equal(result.replacement.replaced, true); assert.equal(result.replacement.deletedQuestionCount, 0);
  assert.equal(calls.length, 1);
});

test("admin options include subjects without frameworks for essay generation", async () => {
  const options = new LoadPreAssessmentGeneratorOptions(async () => [{
    id: "s", topics: [{id: "t", topicName: "Writing"}], languages: ["English"], level: "primary", year: 3,
  }]);
  assert.equal((await options.execute()).syllabuses[0].assessmentFrameworkId, null);
});

test("web rejects non-admin generation and account changes prevent attaching an essay", async () => {
  auth.currentUser = {...administrator, uid: "non-admin"};
  await assert.rejects(() => web.generateEssayPractice(selection()), /not a site administrator/);
  assert.deepEqual(writes, []);
  auth.currentUser = {...administrator};
  onLlm = () => {auth.currentUser = null;};
  await assert.rejects(() => web.generateEssayPractice(selection()), /authenticated/);
  assert.equal(docs.get(topicPath).preAssessmentPractices, undefined);
});

test("new essay feature APIs remain internal and do not expose Firebase endpoints", async () => {
  const entry = await readFile(new URL("../../../functions/index.js", import.meta.url), "utf8");
  for (const name of ["generateEssayPractice", "loadEssayPractice", "createEssayPractice", "getEssayPracticeById"]) {
    assert.ok(!entry.includes(name));
  }
});

test("web account changes while reading the attachment target prevent the syllabus write", async () => {
  let syllabusReads = 0;
  onRead = path => {
    if (path === "syllabuses/syllabus-1" && ++syllabusReads === 2) auth.currentUser = {...administrator, uid: "other"};
  };
  await assert.rejects(() => web.generateEssayPractice(selection()), /account changed/);
  assert.equal(docs.get(topicPath).preAssessmentPractices, undefined);
});

test("subscription skips completed essay assignments when completion races with assignment", async () => {
  const generated = await backend.generateEssayPractice(selection(), trusted);
  let lookupCount = 0, assigned = 0;
  await assignSubscriptionPreAssessmentPractices({studentId: "student-1", syllabusId: "syllabus-1", language: "English"}, {
    getCompletedEssay: async () => ++lookupCount === 1 ? null : {
      syllabusId: "syllabus-1", topicId: "topic-1", essayQuestionId: generated.question.questionId,
    },
    assignEssayPractice: async () => {assigned++; throw new Error("This essay practice has already been completed.");},
  });
  assert.equal(assigned, 1); assert.equal(lookupCount, 2);
});

