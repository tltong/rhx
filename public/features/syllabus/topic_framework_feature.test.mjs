import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./syllabus_module.js";
import * as frameworks from "../assessment_framework/assessment_framework_module.js";
import {resolveTopicAssessmentFrameworkId as webResolve} from "./domain/syllabus.js";
const require = createRequire(import.meta.url);
const ops = require("../../../functions/utils/firebase/firebase_ops");
const originalOps = {...ops}, originalFirebase = globalThis.firebase;
const documents = new Map(), writes = [];
const user = {uid: "admin", email: "admin@example.com", emailVerified: true}, auth = {currentUser: user};
let admin = true, onRead = null, sequence = 0;
const scope = {syllabusId: "syllabus", topicId: "writing", language: "English"};
const topicPath = "syllabuses/syllabus/topics/writing";
function snapshot(path) {
  const data = documents.has(path) ? structuredClone(documents.get(path)) : undefined;
  return {id: path.split("/").at(-1), exists: data !== undefined, data: () => data};
}
function list(path) {return [...documents.keys()].filter(key => key.startsWith(path + "/") && !key.slice(path.length + 1).includes("/")).map(snapshot);}
function ref(path) {return {path, id: path.split("/").at(-1), collection: name => collection(path + "/" + name),
  async get() {const saved = snapshot(path); await onRead?.(path); return saved;},
  async set(data, options) {documents.set(path, structuredClone(options?.merge ? {...documents.get(path), ...data} : data)); writes.push(path);},
  async delete() {documents.delete(path); writes.push(path);},
};}
function collection(path) {return {doc: id => ref(path + "/" + (id || "generated-" + ++sequence)), get: async () => ({docs: list(path)})};}
const db = {collection, async runTransaction(operation) {
  const pending = [];
  const result = await operation({get: doc => {assert.equal(pending.length, 0); return doc.get();},
    update: (doc, field, value) => pending.push({doc, field, value})});
  for (const {doc, field, value} of pending) {
    const [map, key] = field.segments;
    const saved = structuredClone(documents.get(doc.path));
    saved[map] ||= {};
    if (value?.__delete || value?.constructor.name === "DeleteTransform") delete saved[map][key]; else saved[map][key] = value;
    documents.set(doc.path, saved); writes.push(doc.path);
  }
  return result;
}};
class FieldPath {constructor(...segments) {this.segments = segments;}}
const firestore = () => db; firestore.FieldPath = FieldPath; firestore.FieldValue = {delete: () => ({__delete: true})};
const app = {firestore: () => db, auth: () => auth, functions: () => ({httpsCallable: name => async () => {
  assert.equal(name, "isCurrentUserSiteAdmin"); return {data: {isAdmin: admin, email: auth.currentUser?.email, emailVerified: true}};
}})};
globalThis.firebase = {apps: [], initializeApp: () => app, firestore};
ops.getFirestoreDb = () => db;
ops.readDocument = async (path, id) => {const doc = await ref(path + "/" + id).get(); return doc.exists ? {...doc.data(), id: doc.id} : null;};
ops.readCollection = async path => list(path).map(doc => ({...doc.data(), id: doc.id}));
const backend = require("../../../functions/features/syllabus/syllabus_module");
const backendFrameworks = require("../../../functions/features/assessment_framework/assessment_framework_module");
const {resolveTopicAssessmentFrameworkId: backendResolve} = require("../../../functions/features/syllabus/domain/syllabus");
function seed() {
  documents.set("syllabuses/syllabus", {country: "Malaysia", level: "primary", year: 3, subject: "Language", languages: ["English", "Bahasa Melayu"], assessmentFrameworkId: "normal"});
  documents.set(topicPath, {topicName: "Writing", pausable: false, subtopics: {one: "Paragraphs"}, preAssessmentPractices: {english: {language: "English", practiceId: "initial", practiceType: "essay"}}});
  for (const id of ["normal", "essay", "other"]) {
    documents.set("assessmentFrameworks/" + id, {name: id, endLevelName: "Ready", ...(id === "normal" ? {} : {frameworkType: "essay"})});
    for (const [index, levelId] of ["first", "second"].entries()) documents.set("assessmentFrameworks/" + id + "/levels/" + levelId,
      {levelName: levelId, sequenceOrder: index + 1, criteria: {requiredPracticeCount: 2, minimumScore: 70, questionsPerPractice: id === "normal" ? 10 : 1, difficultyLevel: "medium"}});
  }
}
beforeEach(() => {documents.clear(); writes.length = 0; admin = true; auth.currentUser = user; onRead = null; seed();});
after(() => {Object.assign(ops, originalOps); if (originalFirebase === undefined) delete globalThis.firebase; else globalThis.firebase = originalFirebase;});

for (const [layer, api, resolve] of [["backend", backend, backendResolve], ["web", web, webResolve]]) {
  test(layer + ": topic override wins for its language and other languages inherit the syllabus default", async () => {
    assert.equal(await api.getTopicAssessmentFrameworkId(scope), "normal");
    await api.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: "essay"});
    assert.equal(await api.getTopicAssessmentFrameworkId(scope), "essay");
    assert.equal(await api.getTopicAssessmentFrameworkId({...scope, language: " bahasa   melayu "}), "normal");
    const syllabus = await api.getSyllabusById("syllabus");
    assert.equal(resolve(syllabus, scope), "essay");
    assert.equal(syllabus.topics[0].pausable, false); assert.deepEqual(syllabus.topics[0].subtopics, {one: "Paragraphs"});
    assert.equal(documents.get(topicPath).preAssessmentPractices.english.practiceId, "initial");
  });
  test(layer + ": concurrent language changes preserve both overrides and clearing removes only the selected key", async () => {
    await Promise.all([
      api.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: "essay"}),
      api.assignTopicAssessmentFramework({...scope, language: "Bahasa Melayu", assessmentFrameworkId: "other"}),
    ]);
    assert.deepEqual(documents.get(topicPath).assessmentFrameworkIds, {english: "essay", bahasa_melayu: "other"});
    await api.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: null});
    assert.deepEqual(documents.get(topicPath).assessmentFrameworkIds, {bahasa_melayu: "other"});
    assert.equal(await api.getTopicAssessmentFrameworkId(scope), "normal");
    assert.equal(await api.getTopicAssessmentFrameworkId({...scope, language: "Bahasa Melayu"}), "other");
  });
  test(layer + ": invalid topic, language or framework cannot create partial bindings", async () => {
    for (const change of [{topicId: "missing"}, {language: "French"}, {assessmentFrameworkId: "missing"}, {assessmentFrameworkId: "bad/id"}]) {
      await assert.rejects(api.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: "essay", ...change}));
    }
    assert.deepEqual(writes, []);
  });
  test(layer + ": an explicit essay binding prevents assigning a normal pre-assessment to that topic/language", async () => {
    await api.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: "essay"});
    await assert.rejects(api.assignTopicPreAssessmentPractice("syllabus", "writing", "English", "normal-practice", "normal"), /does not match/);
  });
}
test("web binding writes require an administrator and stop if the account changes while checking a framework", async () => {
  admin = false; await assert.rejects(web.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: "essay"}), /admin/i);
  admin = true; onRead = path => {if (path === "assessmentFrameworks/essay") auth.currentUser = {...user, uid: "other"};};
  await assert.rejects(web.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: "essay"}), /account changed/);
  assert.deepEqual(writes, []);
});
test("whole syllabus edits retain overrides, and removing a language deletes its override", async () => {
  await web.assignTopicAssessmentFramework({...scope, assessmentFrameworkId: "essay"});
  let syllabus = await web.getSyllabusById("syllabus");
  await web.updateSyllabusRecord(syllabus, {subject: "Writing"});
  assert.equal((await backend.getSyllabusById("syllabus")).topics[0].assessmentFrameworkIds.english, "essay");
  syllabus = await web.getSyllabusById("syllabus");
  await web.deleteSyllabusLanguage(syllabus.id, "English");
  assert.deepEqual(documents.get(topicPath).assessmentFrameworkIds, {});
});
test("legacy frameworks default to normal and essay framework configuration persists through web/backend APIs", async () => {
  assert.equal((await backendFrameworks.getAssessmentFrameworkById("normal")).frameworkType, "normal");
  const input = {name: "Essay framework", endLevelName: "Ready", frameworkType: "essay", levels: [{id: "first", levelName: "First", sequenceOrder: 1,
    criteria: {requiredPracticeCount: 3, minimumScore: 80, questionsPerPractice: 1, difficultyLevel: "medium"}}]};
  const created = await frameworks.createAssessmentFrameworkRecord(input);
  const saved = await backendFrameworks.getAssessmentFrameworkById(created.id);
  assert.equal(saved.frameworkType, "essay"); assert.equal(saved.preAssessment, null);
  assert.equal(saved.levels[0].criteria.requiredPracticeCount, 3);
  assert.equal((await backendFrameworks.calculateAssessmentProgression({assessmentFrameworkId: saved.id, scores: [80, 82]})).levelId, "first");
  assert.equal((await frameworks.calculateAssessmentProgression({assessmentFrameworkId: saved.id, scores: [80, 82, 85]})).isEndLevel, true);
  await assert.rejects(frameworks.saveAssessmentFrameworkPreAssessment(saved.id, {}), /do not use pre-assessment/);
  for (const criteria of [{questionsPerPractice: 2}, {difficultyLevel: "hard"}, {requiredPracticeCount: 0}, {minimumScore: 101}]) {
    const before = writes.length;
    await assert.rejects(frameworks.createAssessmentFrameworkRecord({...input, levels: [{...input.levels[0], criteria: {...input.levels[0].criteria, ...criteria}}]}));
    assert.equal(writes.length, before);
  }
});
