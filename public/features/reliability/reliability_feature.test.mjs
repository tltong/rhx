import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./reliability_module.js";
import * as webSchema from "../../config/firebase/reliability_schema.js";
import {CalculateTopicReliabilityScore as WebTopicCalculator} from "./application/calculate_topic_reliability_score.js";

const require = createRequire(import.meta.url);
const backendSchema = require("../../../functions/schema/reliability_schema.js");
const {CalculateTopicReliabilityScore: BackendTopicCalculator} = require("../../../functions/features/reliability/application/calculate_topic_reliability_score.js");
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalBackendOps = {...backendOps};
const originalFirebase = globalThis.firebase;
const scope = {studentId: "student-1", syllabusId: "math", topicId: "fractions"};
const configPath = "reliability/config";
const subjectPath = "reliability/student-1/syllabuses/math";
const topicPath = subjectPath + "/topics/fractions";
const baseTime = new Date("2026-10-09T00:00:00Z");
const adminUser = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...adminUser}};
const documents = new Map();
const reads = [];
const writes = [];
const callables = [];
let readFailure = null;
let readFailurePath = null;
let writeFailure = null;
let onAdminCheck = null;

function snapshot(path) {
  return {id: path.split("/").at(-1), exists: documents.has(path), data: () => documents.get(path)};
}

function checkRead(path) {
  reads.push(path);
  if (readFailure && (!readFailurePath || readFailurePath === path)) throw readFailure;
}

function reference(path) {
  return {
    id: path.split("/").at(-1), path,
    collection: name => collection(path + "/" + name),
    async get() { checkRead(path); return snapshot(path); },
    async set(data, options) {
      if (writeFailure) throw writeFailure;
      writes.push({path, data, options});
      const timestamp = new Date(baseTime.getTime() + writes.length * 1000);
      const resolved = {...data, updatedAt: {toDate: () => timestamp}};
      documents.set(path, options?.merge ? {...documents.get(path), ...resolved} : resolved);
    }
  };
}

function collection(path, criteria = {}) {
  return {
    doc(id) { return reference(path + "/" + id); },
    where: (field, operator, value) => collection(path, {...criteria, filters: [...(criteria.filters ?? []), [field, value]]}),
    orderBy: () => collection(path, {...criteria, ordered: true}),
    startAfter: after => collection(path, {...criteria, after}),
    limit: limit => collection(path, {...criteria, limit}),
    async get() {
      checkRead(path);
      let paths = [...documents.keys()].filter((key) => (
        key.startsWith(path + "/") && key.slice(path.length + 1).split("/").length === 1
      ));
      paths = paths.filter(key => (criteria.filters ?? []).every(([field, value]) => documents.get(key)[field] === value));
      if (criteria.ordered) paths.sort();
      if (criteria.after) paths = paths.filter(key => key.split("/").at(-1) > criteria.after);
      if (criteria.limit) paths = paths.slice(0, criteria.limit);
      return {docs: paths.map(snapshot)};
    }
  };
}

const db = {collection};
const firestore = () => db;
firestore.FieldPath = {documentId: () => "__name__"};
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
const app = {
  firestore: () => db,
  auth: () => auth,
  functions(region) {
    assert.equal(region, "us-central1");
    return {httpsCallable(name) {
      assert.equal(name, "isCurrentUserSiteAdmin", "Reliability must not use a Firebase callable gateway.");
      return async () => {
        callables.push(name);
        const user = auth.currentUser;
        const status = {
          email: user?.email || null, emailVerified: user?.emailVerified === true,
          isAdmin: user?.email === adminUser.email, bootstrapAvailable: false
        };
        onAdminCheck?.();
        return {data: status};
      };
    }};
  }
};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.readDocument = async (path, id) => {
  const record = await reference(path + "/" + id).get();
  return record.exists ? {...record.data(), id: record.id} : null;
};
backendOps.readCollection = async (path) => (
  (await collection(path).get()).docs.map((record) => ({...record.data(), id: record.id}))
);
backendOps.readCollectionIds = async (path) => (await collection(path).get()).docs.map((record) => record.id);
backendOps.writeDocument = (path, id, data, options) => reference(path + "/" + id).set(data, options);
backendOps.getFirestoreDb = () => db;
const backend = require("../../../functions/features/reliability/reliability_module.js");

function seedSyllabus(id = "math", topicIds = ["fractions", "algebra", "geometry", "measurement"]) {
  documents.set("syllabuses/" + id, {country: "Malaysia", level: "Primary", year: 1, subject: id, languages: ["English"]});
  for (const topicId of topicIds) documents.set("syllabuses/" + id + "/topics/" + topicId, {topicName: topicId});
}

function seedConfig(percentagePerPractice = 10) {
  documents.set(configPath, {percentagePerPractice, updatedAt: {toDate: () => baseTime}, updatedBy: "admin-1"});
}

function seedPractice(id, {studentId = "student-1", syllabusId = "math", topicId = "fractions", type = "assessment", completed = true} = {}) {
  documents.set("practices/" + id, {
    type, dateGenerated: {toDate: () => baseTime},
    questions: [1, 2].map((index) => ({
      syllabusId, topicId, questionId: id + "-question-" + index,
      ...(type === "assessment" ? {language: "English", hasDiagram: false} : {})
    }))
  });
  if (completed) documents.set("studentPractices/" + studentId + "/completedPractices/" + id, {});
}

function seedTopicScore(topicId, score, completedPracticeCount = 0, {studentId = "student-1", syllabusId = "math"} = {}) {
  documents.set("reliability/" + studentId + "/syllabuses/" + syllabusId + "/topics/" + topicId, {
    score, completedPracticeCount, updatedAt: {toDate: () => baseTime}
  });
}

function seedEssay(id, {studentId = scope.studentId, syllabusId = scope.syllabusId, topicId = scope.topicId} = {}) {
  documents.set("studentEssayPractices/" + studentId + "/completedEssayPractices/" + id, {
    essayQuestionId: "essay-" + id, syllabusId, topicId,
    assignedAt: baseTime, completedAt: baseTime, essayText: "My essay.", timeTakenSeconds: 10,
    scoring: {status: "pending"},
  });
}

function saveConfig(api, input) {
  return api === backend ? api.saveReliabilityConfig(input, {updatedBy: "admin-1"}) : api.saveReliabilityConfig(input);
}

beforeEach(() => {
  documents.clear(); reads.length = 0; writes.length = 0; callables.length = 0;
  readFailure = null; readFailurePath = null; writeFailure = null; onAdminCheck = null;
  auth.currentUser = {...adminUser};
  seedSyllabus();
});
after(() => {
  Object.assign(backendOps, originalBackendOps);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

test("backend and web use identical schemas and explicit topic/subject API names", () => {
  assert.deepEqual(webSchema.reliabilityConfigSchema, backendSchema.reliabilityConfigSchema);
  assert.deepEqual(webSchema.studentReliabilitySchema, backendSchema.studentReliabilitySchema);
  assert.equal(webSchema.reliabilityConfigSchema.collection, "reliability");
  assert.equal(webSchema.reliabilityConfigSchema.documentId, "config");
  assert.equal(webSchema.studentReliabilitySchema.collection, "reliability");
  assert.equal(web.DEFAULT_PERCENTAGE_PER_PRACTICE, 10);
  assert.equal(backend.DEFAULT_PERCENTAGE_PER_PRACTICE, 10);
  const apiNames = ["getReliabilityConfig", "saveReliabilityConfig", "calculateTopicReliabilityScore", "calculateSubjectReliabilityScore", "saveTopicReliabilityScore", "getTopicReliabilityScore", "saveSubjectReliabilityScore", "getSubjectReliabilityScore"];
  for (const api of [backend, web]) {
    for (const name of apiNames) assert.equal(typeof api[name], "function");
    for (const name of ["calculateReliabilityScore", "saveReliabilityScore", "getReliabilityScore"]) assert.equal(name in api, false);
  }
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": submitted essays and normal practices count separately even when IDs match, without requiring a grade", async () => {
    seedPractice("same"); seedEssay("same"); seedEssay("second");
    seedEssay("other-topic", {topicId: "algebra"}); seedEssay("other-student", {studentId: "another"});
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 30, completedPracticeCount: 3});
    assert.deepEqual(writes, []);
  });

  test(layer + ": essay reliability reads all pages, caps at 100 and includes untouched topics in the subject average", async () => {
    for (let index = 0; index < 105; index++) seedEssay("attempt-" + String(index).padStart(3, "0"));
    const topic = await api.calculateTopicReliabilityScore(scope);
    assert.deepEqual(topic, {score: 100, completedPracticeCount: 105});
    assert.equal(reads.filter(path => path === "studentEssayPractices/student-1/completedEssayPractices").length, 2);
    await api.saveTopicReliabilityScore({...scope, ...topic});
    assert.equal(await api.calculateSubjectReliabilityScore(scope), 25);
  });

  test(layer + ": initial 10% rate works without persisting default configuration", async () => {
    assert.equal(await api.getReliabilityConfig(), null);
    seedPractice("assessment-1");
    seedPractice("pre-1", {type: "pre assessment"});
    const before = [...documents.entries()];
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 20, completedPracticeCount: 2});
    assert.deepEqual([...documents.entries()], before);
    assert.equal(documents.has(configPath), false);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": configuration writes replace only reliability/config and use trusted administrator identity", async () => {
    const first = await saveConfig(api, {percentagePerPractice: 12.5, updatedBy: "spoofed"});
    assert.equal(first.percentagePerPractice, 12.5);
    assert.equal(first.updatedBy, "admin-1");
    assert.equal(first.updatedAt.getTime(), baseTime.getTime() + 1000);
    await saveConfig(api, {percentagePerPractice: 20});
    assert.equal((await api.getReliabilityConfig()).percentagePerPractice, 20);
    assert.equal([...documents.keys()].filter((path) => path.startsWith("reliability/")).length, 1);
    assert.ok(writes.every(({path, options}) => path === configPath && options.merge === false));
    assert.deepEqual(Object.keys(documents.get(configPath)).sort(), ["percentagePerPractice", "updatedAt", "updatedBy"]);
  });

  test(layer + ": recalculation reads configurable rates, caps at 100 and retains the full count", async () => {
    for (let index = 0; index < 12; index++) seedPractice("practice-" + index);
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 100, completedPracticeCount: 12});
    seedConfig(5);
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 60, completedPracticeCount: 12});
    seedConfig(0.75);
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 9, completedPracticeCount: 12});
    seedConfig(100);
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 100, completedPracticeCount: 12});
    assert.deepEqual(writes, []);
  });

  test(layer + ": only completed practices of the requested student, syllabus and topic contribute", async () => {
    seedPractice("correct-1");
    seedPractice("correct-2", {type: "pre assessment"});
    seedPractice("other-student", {studentId: "student-2"});
    seedPractice("other-syllabus", {syllabusId: "science"});
    seedPractice("other-topic", {topicId: "algebra"});
    seedPractice("unfinished", {completed: false});
    seedPractice("deleted");
    documents.delete("practices/deleted");
    seedPractice("mixed");
    documents.get("practices/mixed").questions[1].topicId = "algebra";
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 20, completedPracticeCount: 2});
    assert.ok(!reads.includes("practices/other-student"));
    assert.ok(!reads.includes("practices/unfinished"));
    assert.ok(!reads.some((path) => path.startsWith("questions/") || path.startsWith("studentReadiness/")));
    assert.deepEqual(callables, []);
  });

  test(layer + ": topics without practice return zero; unknown syllabuses and topics are rejected", async () => {
    assert.deepEqual(await api.calculateTopicReliabilityScore(scope), {score: 0, completedPracticeCount: 0});
    await assert.rejects(() => api.calculateTopicReliabilityScore({...scope, syllabusId: "missing"}), (error) => error.code === "not-found");
    await assert.rejects(() => api.calculateTopicReliabilityScore({...scope, topicId: "missing"}), (error) => error.code === "not-found");
    assert.deepEqual(writes, []);
  });

  test(layer + ": subject reliability includes every current topic in the denominator", async () => {
    seedTopicScore("fractions", 80, 8);
    seedTopicScore("algebra", 20, 2);
    seedTopicScore("geometry", 0, 0);
    seedTopicScore("removed-topic", 100, 10);
    seedTopicScore("fractions", 100, 10, {studentId: "student-2"});
    seedTopicScore("fractions", 100, 10, {syllabusId: "science"});
    documents.set(subjectPath, {score: 99, updatedAt: {toDate: () => baseTime}});
    assert.equal(await api.calculateSubjectReliabilityScore(scope), 25);
    assert.ok(reads.includes(subjectPath + "/topics/measurement"));
    assert.ok(!reads.includes(subjectPath + "/topics/removed-topic"));
    assert.ok(!reads.includes(subjectPath));
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": subject calculation distinguishes all-unpractised topics from an empty syllabus", async () => {
    assert.equal(await api.calculateSubjectReliabilityScore(scope), 0);
    seedSyllabus("empty", []);
    assert.equal(await api.calculateSubjectReliabilityScore({...scope, syllabusId: "empty"}), null);
    await assert.rejects(() => api.calculateSubjectReliabilityScore({...scope, syllabusId: "missing"}), (error) => error.code === "not-found");
    assert.deepEqual(writes, []);
  });

  test(layer + ": subject recalculation rereads latest scores and current syllabus membership", async () => {
    seedTopicScore("fractions", 40, 4);
    assert.equal(await api.calculateSubjectReliabilityScore(scope), 10);
    seedTopicScore("fractions", 80, 8);
    assert.equal(await api.calculateSubjectReliabilityScore(scope), 20);
    documents.delete("syllabuses/math/topics/measurement");
    assert.equal(await api.calculateSubjectReliabilityScore(scope), 80 / 3);
    assert.deepEqual(writes, []);
  });

  test(layer + ": saving topic and subject reliability writes supplied totals and preserves metadata", async () => {
    assert.equal(await api.getTopicReliabilityScore(scope), null);
    assert.equal(await api.getSubjectReliabilityScore(scope), null);
    documents.set(topicPath, {metadata: "topic"});
    documents.set(subjectPath, {metadata: "subject"});
    const topic = await api.saveTopicReliabilityScore({...scope, score: 100, completedPracticeCount: 15, updatedAt: "spoofed"});
    const subject = await api.saveSubjectReliabilityScore({...scope, score: 25, completedPracticeCount: 99, updatedAt: "spoofed"});
    assert.equal(topic.score, 100);
    assert.equal(topic.completedPracticeCount, 15);
    assert.equal(topic.updatedAt.getTime(), baseTime.getTime() + 1000);
    assert.equal(subject.score, 25);
    assert.equal(subject.updatedAt.getTime(), baseTime.getTime() + 2000);
    assert.equal("completedPracticeCount" in subject, false);
    assert.equal(documents.get(topicPath).metadata, "topic");
    assert.equal(documents.get(subjectPath).metadata, "subject");
    assert.ok(writes.every(({options}) => options.merge === true));
    assert.deepEqual(writes.map(({path}) => path), [topicPath, subjectPath]);
    assert.ok(!reads.includes(configPath) && !reads.some((path) => path.startsWith("syllabuses/")));
    await api.saveTopicReliabilityScore({...scope, score: 0, completedPracticeCount: 0});
    await api.saveSubjectReliabilityScore({...scope, score: 0});
    assert.equal((await api.getTopicReliabilityScore(scope)).score, 0);
    assert.equal((await api.getSubjectReliabilityScore(scope)).score, 0);
  });

  test(layer + ": repeated saves do not increment counts or create extra records", async () => {
    seedPractice("practice-1");
    const result = await api.calculateTopicReliabilityScore(scope);
    for (let index = 0; index < 2; index++) {
      await api.saveTopicReliabilityScore({...scope, ...result});
      await api.saveSubjectReliabilityScore({...scope, score: await api.calculateSubjectReliabilityScore(scope)});
    }
    assert.equal((await api.getTopicReliabilityScore(scope)).completedPracticeCount, 1);
    assert.equal((await api.getTopicReliabilityScore(scope)).score, 10);
    assert.equal((await api.getSubjectReliabilityScore(scope)).score, 2.5);
    assert.deepEqual([...documents.keys()].filter((path) => path.startsWith("reliability/")).sort(), [subjectPath, topicPath].sort());
  });

  test(layer + ": saved scores are isolated by student, syllabus and topic", async () => {
    await api.saveTopicReliabilityScore({...scope, score: 50, completedPracticeCount: 5});
    await api.saveSubjectReliabilityScore({...scope, score: 12.5});
    for (const variant of [{...scope, studentId: "student-2"}, {...scope, syllabusId: "science"}, {...scope, topicId: "algebra"}]) {
      assert.equal(await api.getTopicReliabilityScore(variant), null);
      await api.saveTopicReliabilityScore({...variant, score: 20, completedPracticeCount: 2});
    }
    for (const variant of [{...scope, studentId: "student-2"}, {...scope, syllabusId: "science"}]) {
      assert.equal(await api.getSubjectReliabilityScore(variant), null);
      await api.saveSubjectReliabilityScore({...variant, score: 5});
    }
    assert.equal((await api.getTopicReliabilityScore(scope)).score, 50);
    assert.equal((await api.getSubjectReliabilityScore(scope)).score, 12.5);
  });

  test(layer + ": invalid percentages, scores, counts and scopes fail before database access", async () => {
    for (const percentagePerPractice of [undefined, null, "10", true, 0, -1, 101, NaN, Infinity]) {
      await assert.rejects(() => saveConfig(api, {percentagePerPractice}), /percentagePerPractice/);
    }
    for (const input of [undefined, null, [], "10", {}]) {
      await assert.rejects(() => saveConfig(api, input), /configuration|percentagePerPractice/);
    }
    for (const score of [undefined, null, "50", true, -1, 101, NaN, Infinity]) {
      await assert.rejects(() => api.saveTopicReliabilityScore({...scope, score, completedPracticeCount: 1}), /score/);
      await assert.rejects(() => api.saveSubjectReliabilityScore({...scope, score}), /score/);
    }
    for (const completedPracticeCount of [undefined, null, "1", true, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(() => api.saveTopicReliabilityScore({...scope, score: 10, completedPracticeCount}), /completedPracticeCount/);
    }
    for (const key of ["studentId", "syllabusId", "topicId"]) {
      for (const value of [undefined, null, 42, "", " ", "injected/path", ".", ".."]) {
        const invalid = {...scope, [key]: value};
        const operations = [
          () => api.calculateTopicReliabilityScore(invalid),
          () => api.getTopicReliabilityScore(invalid),
          () => api.saveTopicReliabilityScore({...invalid, score: 10, completedPracticeCount: 1})
        ];
        if (key !== "topicId") operations.push(
          () => api.calculateSubjectReliabilityScore(invalid),
          () => api.getSubjectReliabilityScore(invalid),
          () => api.saveSubjectReliabilityScore({...invalid, score: 10})
        );
        for (const operation of operations) await assert.rejects(operation, new RegExp(key));
      }
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": malformed stored values are rejected instead of contributing zero", async () => {
    seedConfig(0);
    await assert.rejects(() => api.getReliabilityConfig(), /percentagePerPractice/);
    await assert.rejects(() => api.calculateTopicReliabilityScore(scope), /percentagePerPractice/);
    documents.delete(configPath);
    seedTopicScore("fractions", 101, 1);
    await assert.rejects(() => api.getTopicReliabilityScore(scope), /score/);
    await assert.rejects(() => api.calculateSubjectReliabilityScore(scope), /score/);
    seedTopicScore("fractions", 10, -1);
    await assert.rejects(() => api.getTopicReliabilityScore(scope), /completedPracticeCount/);
    seedTopicScore("fractions", 10, 1);
    documents.get(topicPath).updatedAt = "invalid";
    await assert.rejects(() => api.getTopicReliabilityScore(scope), /timestamp/);
    documents.set(subjectPath, {score: 50, updatedAt: "invalid"});
    await assert.rejects(() => api.getSubjectReliabilityScore(scope), /timestamp/);
    assert.deepEqual(writes, []);
  });

  test(layer + ": failed writes retain current data and failed reads never invent scores", async () => {
    seedConfig(10);
    seedTopicScore("fractions", 50, 5);
    documents.set(subjectPath, {score: 12.5, updatedAt: {toDate: () => baseTime}});
    const before = [...documents.entries()];
    writeFailure = new Error("write failed");
    await assert.rejects(() => saveConfig(api, {percentagePerPractice: 20}), /write failed/);
    await assert.rejects(() => api.saveTopicReliabilityScore({...scope, score: 80, completedPracticeCount: 8}), /write failed/);
    await assert.rejects(() => api.saveSubjectReliabilityScore({...scope, score: 20}), /write failed/);
    assert.deepEqual([...documents.entries()], before);
    readFailure = new Error("read failed");
    for (const operation of [
      () => api.getReliabilityConfig(), () => api.getTopicReliabilityScore(scope),
      () => api.getSubjectReliabilityScore(scope), () => api.calculateTopicReliabilityScore(scope),
      () => api.calculateSubjectReliabilityScore(scope)
    ]) await assert.rejects(operation, /read failed/);
    readFailurePath = subjectPath + "/topics/measurement";
    await assert.rejects(() => api.calculateSubjectReliabilityScore(scope), /read failed/);
  });
}

test("backend configuration writes require explicit administrator context", async () => {
  for (const context of [undefined, {}, {updatedBy: null}, {updatedBy: " "}]) {
    await assert.rejects(() => backend.saveReliabilityConfig({percentagePerPractice: 10, updatedBy: "spoofed"}, context), /updatedBy/);
  }
  assert.deepEqual(writes, []);
});

test("web configuration writes reject non-admin users and account changes during authorization", async () => {
  auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};
  await assert.rejects(() => web.saveReliabilityConfig({percentagePerPractice: 10}), /administrator/);
  auth.currentUser = {...adminUser};
  onAdminCheck = () => { auth.currentUser = {...adminUser, uid: "different-user"}; };
  await assert.rejects(() => web.saveReliabilityConfig({percentagePerPractice: 10}), /account changed/);
  assert.deepEqual(writes, []);
});

test("all web APIs require authentication", async () => {
  auth.currentUser = null;
  for (const operation of [
    () => web.getReliabilityConfig(), () => web.saveReliabilityConfig({percentagePerPractice: 10}),
    () => web.calculateTopicReliabilityScore(scope), () => web.calculateSubjectReliabilityScore(scope),
    () => web.saveTopicReliabilityScore({...scope, score: 10, completedPracticeCount: 1}),
    () => web.getTopicReliabilityScore(scope), () => web.saveSubjectReliabilityScore({...scope, score: 10}),
    () => web.getSubjectReliabilityScore(scope)
  ]) await assert.rejects(operation, /authenticated user/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

test("backend and web share configuration and topic/subject score storage", async () => {
  await backend.saveReliabilityConfig({percentagePerPractice: 12.5}, {updatedBy: "admin-1"});
  assert.equal((await web.getReliabilityConfig()).percentagePerPractice, 12.5);
  seedPractice("completed");
  const calculated = await web.calculateTopicReliabilityScore(scope);
  assert.deepEqual(calculated, {score: 12.5, completedPracticeCount: 1});
  await backend.saveTopicReliabilityScore({...scope, ...calculated});
  const topic = await web.getTopicReliabilityScore(scope);
  assert.deepEqual({...topic}, {...await backend.getTopicReliabilityScore(scope)});
  const subjectScore = await backend.calculateSubjectReliabilityScore(scope);
  assert.equal(subjectScore, 3.125);
  await web.saveSubjectReliabilityScore({...scope, score: subjectScore});
  assert.deepEqual({...await web.getSubjectReliabilityScore(scope)}, {...await backend.getSubjectReliabilityScore(scope)});
});

test("completion trigger counts the stored completion and persists topic then subject reliability before generation", async () => {
  const {assessCompletedStudentPractice} = require("../../../functions/triggers/student_practice_completion_trigger.js");
  seedConfig(15);
  seedPractice("older");
  seedPractice("current", {type: "pre assessment"});
  seedTopicScore("fractions", 0, 0);
  seedTopicScore("algebra", 20, 2);
  documents.set(subjectPath, {score: 99, updatedAt: {toDate: () => baseTime}});
  const operations = [];
  const result = await assessCompletedStudentPractice({
    eventId: " event-1 ", studentId: " student-1 ", practiceId: " current ",
  }, {
    processingRepository: {
      async markProcessing() { operations.push("processing"); },
      async markGenerating() { operations.push("generating"); },
      async markCompleted(input) {
        assert.equal((await backend.getSubjectReliabilityScore(scope)).score, 12.5);
        assert.equal(input.generatedPracticeId, "next");
        operations.push("completed");
      },
      async markFailed() { operations.push("failed"); },
    },
    assessPractice: async (input) => {
      assert.deepEqual(input, {studentId: "student-1", practiceId: "current"});
      return {assessed: true, isFrameworkCompleted: false, syllabusId: " math ", topicId: " fractions "};
    },
    calculateReadiness: async () => null,
    saveReadiness: async () => { throw new Error("must not save a null readiness score"); },
    calculateSubjectReadiness: async () => { throw new Error("must not calculate readiness without a topic save"); },
    saveSubjectReadiness: async () => { throw new Error("must not save readiness without a topic save"); },
    generatePractice: async (input) => {
      assert.deepEqual(input, scope);
      assert.equal((await backend.getTopicReliabilityScore(scope)).completedPracticeCount, 2);
      assert.equal((await web.getTopicReliabilityScore(scope)).score, 30);
      // The subject average includes geometry and measurement, both without scores.
      assert.equal((await web.getSubjectReliabilityScore(scope)).score, 12.5);
      operations.push("generate");
      return {practice: {id: "next"}};
    },
    // Exercise the actual reliability APIs through the trigger's default dependencies.
  });
  assert.equal(result.generation.practice.id, "next");
  assert.deepEqual(operations, ["processing", "generating", "generate", "completed"]);
  assert.deepEqual(writes.map(({path}) => path), [topicPath, subjectPath]);
  assert.equal(writes[0].data.completedPracticeCount, 2);
  assert.equal(writes[0].data.score, 30);
  assert.equal(writes[1].data.score, 12.5);
  assert.deepEqual(callables, []);
});

test("completion retries repair a failed subject reliability save without double-counting, including after framework completion", async () => {
  const {assessCompletedStudentPractice} = require("../../../functions/triggers/student_practice_completion_trigger.js");
  for (let index = 0; index < 12; index++) seedPractice("older-" + index);
  seedPractice("current", {type: "pre assessment"});
  let completed = false;
  let failSubject = true;
  const operations = [];
  const dependencies = {
    processingRepository: {
      async markProcessing() { return {shouldProcess: !completed}; },
      async markGenerating() { throw new Error("must not generate for a completed framework"); },
      async markCompleted(input) {
        assert.equal((await web.getSubjectReliabilityScore(scope)).score, 25);
        assert.equal(input.outcome, "framework-completed");
        completed = true;
        operations.push("completed");
      },
      async markFailed() { operations.push("failed"); },
    },
    assessPractice: async () => ({
      assessed: false, reason: "framework-already-completed", isFrameworkCompleted: true,
      syllabusId: scope.syllabusId, topicId: scope.topicId,
    }),
    calculateReadiness: async () => null,
    saveSubjectReliability: async (input) => {
      if (failSubject) throw new Error("subject reliability save failed");
      return backend.saveSubjectReliabilityScore(input);
    },
    generatePractice: async () => { throw new Error("must not generate for a completed framework"); },
  };
  const input = {eventId: "first", studentId: scope.studentId, practiceId: "current"};
  await assert.rejects(() => assessCompletedStudentPractice(input, dependencies), /subject reliability save failed/);
  assert.equal((await web.getTopicReliabilityScore(scope)).score, 100);
  assert.equal((await web.getTopicReliabilityScore(scope)).completedPracticeCount, 13);
  assert.equal(await web.getSubjectReliabilityScore(scope), null);
  assert.deepEqual(writes.map(({path}) => path), [topicPath]);
  failSubject = false;
  await assessCompletedStudentPractice({...input, eventId: "retry"}, dependencies);
  assert.equal((await web.getTopicReliabilityScore(scope)).completedPracticeCount, 13);
  assert.equal((await web.getSubjectReliabilityScore(scope)).score, 25);
  assert.deepEqual(operations, ["failed", "completed"]);
  assert.deepEqual(writes.map(({path}) => path), [topicPath, topicPath, subjectPath]);
  assert.equal(documents.has(configPath), false, "The trigger uses the initial rate without writing a default configuration.");
  const writesBefore = writes.length;
  const duplicate = await assessCompletedStudentPractice(input, dependencies);
  assert.equal(duplicate.alreadyProcessed, true);
  assert.equal(writes.length, writesBefore);
  assert.deepEqual(callables, []);
});

for (const [layer, Calculator] of [["backend", BackendTopicCalculator], ["web", WebTopicCalculator]]) {
  test(layer + ": duplicate completion IDs and multiple questions earn one contribution per practice", async () => {
    const ids = ["same", "same", " same "];
    const original = [...ids];
    const practiceReads = [];
    const calculator = new Calculator({
      getReliabilityConfig: async () => null,
      getSyllabusById: async () => ({topics: [{id: "fractions"}]}),
      listCompletedPracticeIds: async () => ids,
      getPracticeById: async (id) => {
        practiceReads.push(id);
        return {questions: [1, 2].map(() => ({syllabusId: "math", topicId: "fractions"}))};
      }
    });
    assert.deepEqual(await calculator.execute(scope), {score: 10, completedPracticeCount: 1});
    assert.deepEqual(practiceReads, ["same"]);
    assert.deepEqual(ids, original);
  });
}
