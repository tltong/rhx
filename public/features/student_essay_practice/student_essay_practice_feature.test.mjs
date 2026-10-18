import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import * as web from "./student_essay_practice_module.js";
import * as webSchema from "../../config/firebase/student_essay_practice_schema.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops");
const originalOps = {...backendOps}, originalFirebase = globalThis.firebase;
const documents = new Map(), versions = new Map(), reads = [], writes = [], queries = [];
const now = new Date("2026-10-17T12:00:00Z"), earlier = new Date("2026-10-16T09:00:00Z");
const user = {uid: "parent-account", email: "parent@example.com", emailVerified: true};
const auth = {currentUser: {...user}};
let autoId, onRead, onTransactionRead, writeFailure;
function put(path, data) {
  documents.set(path, structuredClone(data));
  versions.set(path, (versions.get(path) ?? 0) + 1);
}
function snapshot(path) {
  const exists = documents.has(path), data = exists ? structuredClone(documents.get(path)) : undefined;
  return {id: path.split("/").at(-1), exists, data: () => structuredClone(data)};
}
async function read(path) {
  reads.push(path);
  const result = snapshot(path);
  await onRead?.(path);
  return result;
}
function save(path, data, options) {
  const resolved = {...data};
  for (const field of ["assignedAt", "completedAt"]) {
    if (Object.hasOwn(resolved, field) && !(resolved[field] instanceof Date)) resolved[field] = now;
  }
  const value = options?.merge ? {...documents.get(path), ...resolved} : resolved;
  writes.push({path, data: structuredClone(resolved), options});
  put(path, value);
}
function reference(path) {
  return {path, id: path.split("/").at(-1), get: () => read(path),
    collection: name => query(path + "/" + name)};
}
function query(path, criteria = {}) {
  return {
    doc: id => reference(path + "/" + (id ?? "attempt-" + String(++autoId).padStart(4, "0"))),
    where(field, operator, value) {
      assert.ok(["syllabusId", "topicId"].includes(field)); assert.equal(operator, "==");
      return query(path, {...criteria, [field]: value});
    },
    orderBy(field) {assert.ok(field); return query(path, {...criteria, ordered: true});},
    startAfter(id) {assert.equal(typeof id, "string"); return query(path, {...criteria, after: id});},
    limit(limit) {assert.ok(Number.isSafeInteger(limit) && limit > 0); return query(path, {...criteria, limit});},
    async get() {
      queries.push({path, ...criteria}); reads.push(path); await onRead?.(path);
      assert.equal(criteria.ordered, true);
      const prefix = path + "/";
      const paths = [...documents.keys()].filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .filter(key => ["syllabusId", "topicId"].every(field => criteria[field] === undefined || documents.get(key)[field] === criteria[field]))
        .filter(key => criteria.after === undefined || key.slice(prefix.length) > criteria.after)
        .sort().slice(0, criteria.limit);
      return {docs: paths.map(snapshot)};
    },
  };
}
const db = {
  collection: path => query(path), doc: reference,
  async runTransaction(operation) {
    // Optimistic retries model conflicting concurrent attempts and discard uncommitted writes.
    for (let retry = 0; retry < 5; retry++) {
      const pending = [], observed = new Map();
      const result = await operation({
        async get(ref) {
          assert.equal(pending.length, 0, "Firestore transactions require reads before writes");
          observed.set(ref.path, versions.get(ref.path) ?? 0);
          const result = await ref.get(); await onTransactionRead?.(ref.path); return result;
        },
        set: (ref, data, options) => pending.push({ref, data, options}),
        delete: ref => pending.push({ref, remove: true}),
      });
      if ([...observed].some(([path, version]) => (versions.get(path) ?? 0) !== version)) continue;
      if (writeFailure) throw writeFailure;
      for (const item of pending) {
        if (item.remove) {
          documents.delete(item.ref.path); versions.set(item.ref.path, (versions.get(item.ref.path) ?? 0) + 1);
          writes.push({path: item.ref.path, remove: true});
        } else save(item.ref.path, item.data, item.options);
      }
      return result;
    }
    throw new Error("Transaction conflict");
  },
};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
firestore.FieldPath = {documentId: () => "__name__"};
const app = {firestore: () => db, auth: () => auth, functions() {throw new Error("Essay practice APIs must not call Firebase endpoints");}};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.getFirestoreDb = () => db;
const backend = require("../../../functions/features/student_essay_practice/student_essay_practice_module");
const backendSchema = require("../../../functions/schema/student_essay_practice_schema");
const apis = ["assignEssayPracticeToStudent", "getAssignedEssayPractice", "listAssignedEssayPractices",
  "completeAssignedEssayPractice", "getCompletedEssayPractice", "listCompletedEssayPractices"];
const assignment = changes => ({studentId: "student-1", essayQuestionId: "question-1", syllabusId: "syllabus-1", topicId: "topic-1", ...changes});
const completion = changes => ({studentId: "student-1", essayPracticeId: "attempt-1",
  essayText: "  My first paragraph.\n\nMy second paragraph.  ", timeTakenSeconds: 90.5, ...changes});
const ref = essayPracticeId => ({studentId: "student-1", essayPracticeId});
const assignedPath = (id, studentId = "student-1") => "studentEssayPractices/" + studentId + "/assignedEssayPractices/" + id;
const completedPath = (id, studentId = "student-1") => "studentEssayPractices/" + studentId + "/completedEssayPractices/" + id;
const assignmentRecord = changes => ({essayQuestionId: "question-1", syllabusId: "syllabus-1", topicId: "topic-1", assignedAt: earlier, ...changes});
function seedQuestion() {
  const path = "essayQuestionGenerator/primary/standards/3/languages/English/questions/question-1";
  put("essayQuestionGenerator/questionIndex/entries/question-1", {documentPath: path});
  put(path, {questionText: "Write about friendship.", difficulty: "medium", seedUsed: "Friendship", generatedAt: earlier});
}
beforeEach(() => {
  documents.clear(); versions.clear(); reads.length = writes.length = queries.length = 0;
  autoId = 0; onRead = onTransactionRead = writeFailure = null; auth.currentUser = {...user};
});
after(() => {
  Object.assign(backendOps, originalOps);
  if (originalFirebase === undefined) delete globalThis.firebase; else globalThis.firebase = originalFirebase;
});

test("matching backend/web schemas and all six APIs; no callable exports", async () => {
  for (const key of Object.keys(backendSchema)) assert.deepEqual(webSchema[key], backendSchema[key]);
  assert.deepEqual(webSchema.studentEssayPracticeSchema.subcollections.assignedEssayPractices.fields,
    {essayQuestionId: "string", syllabusId: "string", topicId: "string", assignedAt: "timestamp"});
  assert.deepEqual(webSchema.studentEssayPracticeSchema.subcollections.completedEssayPractices.fields,
    {essayQuestionId: "string", syllabusId: "string", topicId: "string", assignedAt: "timestamp",
      completedAt: "timestamp", essayText: "string", timeTakenSeconds: "number"});
  for (const api of [backend, web]) for (const name of apis) assert.equal(typeof api[name], "function");
  const entry = await readFile(new URL("../../../functions/index.js", import.meta.url), "utf8");
  for (const name of apis) assert.ok(!entry.includes(name));
});

test("essay practice owns its APIs and storage independently of Student Practice", async () => {
  const legacyBackend = require("../../../functions/features/student_practice/student_practice_module");
  const legacyWeb = await import("../student_practice/student_practice_module.js");
  const legacySchema = require("../../../functions/schema/student_practice_schema");
  assert.equal(webSchema.STUDENT_ESSAY_PRACTICES_COLLECTION, "studentEssayPractices");
  assert.notEqual(webSchema.STUDENT_ESSAY_PRACTICES_COLLECTION, legacySchema.STUDENT_PRACTICES_COLLECTION);
  for (const api of [legacyBackend, legacyWeb]) {
    for (const name of apis) assert.equal(Object.hasOwn(api, name), false);
    assert.equal(typeof api.assignPracticeToStudent, "function");
    assert.equal(typeof api.completeAssignedPractice, "function");
  }
  assert.equal(Object.hasOwn(legacySchema.studentPracticeSchema.subcollections, "assignedEssayPractices"), false);
  assert.equal(Object.hasOwn(legacySchema.studentPracticeSchema.subcollections, "completedEssayPractices"), false);
  for (const path of [
    "../../../functions/features/student_essay_practice/student_essay_practice_module.js",
    "../../../functions/features/student_essay_practice/infrastructure/firestore_student_essay_practice_repository.js",
    "./student_essay_practice_module.js",
    "./infrastructure/firestore_student_essay_practice_repository.js",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /student_practice_module|student_practice_schema|studentPractices\//);
  }
  for (const path of [
    "../../../functions/features/student_practice/student_practice_module.js",
    "../student_practice/student_practice_module.js",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /student_essay_practice|essay_question_generator/);
  }
  assert.deepEqual(reads, []); assert.deepEqual(writes, []);
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": empty reads do not create records", async () => {
    assert.equal(await api.getAssignedEssayPractice(ref("missing")), null);
    assert.equal(await api.getCompletedEssayPractice(ref("missing")), null);
    for (const name of ["listAssignedEssayPractices", "listCompletedEssayPractices"]) {
      assert.deepEqual(await api[name]({studentId: "student-1", limit: 5}), {practices: [], nextCursor: null});
    }
    assert.deepEqual(writes, []);
  });

  test(layer + ": assignments reference existing questions, allocate independent attempt IDs and preserve other practice data", async () => {
    await assert.rejects(() => api.assignEssayPracticeToStudent(assignment()), /question could not be found/);
    assert.deepEqual(writes, []);
    seedQuestion();
    const root = "studentEssayPractices/student-1", mcqRoot = "studentPractices/student-1", mcq = mcqRoot + "/assignedPractices/mcq-1";
    put(root, {preserved: true}); put(mcqRoot, {independent: true}); put(mcq, {});
    const first = await api.assignEssayPracticeToStudent(assignment({assignedAt: earlier, questionText: "spoof"}));
    const second = await api.assignEssayPracticeToStudent(assignment());
    assert.notEqual(first.essayPracticeId, second.essayPracticeId);
    assert.notEqual(first.essayPracticeId, "question-1");
    assert.equal(first.essayQuestionId, "question-1");
    assert.equal(first.studentId, "student-1"); assert.deepEqual(first.assignedAt, now);
    assert.deepEqual(Object.keys(documents.get(assignedPath(first.essayPracticeId))).sort(),
      ["assignedAt", "essayQuestionId", "syllabusId", "topicId"]);
    assert.deepEqual(documents.get(root), {preserved: true}); assert.deepEqual(documents.get(mcqRoot), {independent: true});
    assert.deepEqual(documents.get(mcq), {});
    assert.ok(writes.every(item => !item.path.startsWith("studentPractices/")));
    assert.deepEqual(await api.getAssignedEssayPractice(ref(first.essayPracticeId)), first);
  });

  test(layer + ": a stable assignment ID makes retries idempotent and prevents conflicting reuse", async () => {
    seedQuestion();
    const input = assignment({essayPracticeId: "attempt-1"});
    const first = await api.assignEssayPracticeToStudent(input), count = writes.length;
    assert.deepEqual(await api.assignEssayPracticeToStudent(input), first); assert.equal(writes.length, count);
    await assert.rejects(() => api.assignEssayPracticeToStudent({...input, topicId: "topic-2"}), /already assigned/);
    assert.equal(writes.length, count);
    await api.completeAssignedEssayPractice(completion());
    await assert.rejects(() => api.assignEssayPracticeToStudent(input), /already been completed/);
    assert.equal(documents.has(assignedPath("attempt-1")), false);
  });

  test(layer + ": completion atomically preserves assignment metadata and exact student text", async () => {
    put(assignedPath("attempt-1"), assignmentRecord());
    const saved = await api.completeAssignedEssayPractice(completion({
      syllabusId: "spoof", topicId: "spoof", essayQuestionId: "spoof", assignedAt: now, completedAt: earlier,
    }));
    assert.equal(documents.has(assignedPath("attempt-1")), false);
    assert.deepEqual(saved, {...ref("attempt-1"), ...assignmentRecord(),
      completedAt: now, essayText: completion().essayText, timeTakenSeconds: 90.5});
    assert.deepEqual(Object.keys(documents.get(completedPath("attempt-1"))).sort(),
      ["assignedAt", "completedAt", "essayQuestionId", "essayText", "syllabusId", "timeTakenSeconds", "topicId"]);
    assert.deepEqual(await api.getCompletedEssayPractice(ref("attempt-1")), saved);
    assert.equal(await api.getAssignedEssayPractice(ref("attempt-1")), null);
    const count = writes.length;
    assert.deepEqual(await api.completeAssignedEssayPractice(completion({essayText: "Changed", timeTakenSeconds: 0})), saved);
    assert.equal(writes.length, count);
  });

  test(layer + ": transaction failure leaves assignment intact and a missing assignment cannot be completed", async () => {
    await assert.rejects(() => api.completeAssignedEssayPractice(completion()), /could not be found/);
    assert.deepEqual(writes, []);
    put(assignedPath("attempt-1"), assignmentRecord()); writeFailure = new Error("Write unavailable");
    await assert.rejects(() => api.completeAssignedEssayPractice(completion()), /Write unavailable/);
    assert.equal(documents.has(assignedPath("attempt-1")), true);
    assert.equal(documents.has(completedPath("attempt-1")), false); assert.deepEqual(writes, []);
  });

  test(layer + ": assignment and completion retries recover after a committed transaction loses its response", async () => {
    seedQuestion();
    let assignedReads = 0;
    onRead = path => {if (path === assignedPath("attempt-1") && ++assignedReads === 2) throw new Error("Response unavailable");};
    await assert.rejects(() => api.assignEssayPracticeToStudent(assignment({essayPracticeId: "attempt-1"})), /Response unavailable/);
    onRead = null;
    const first = await api.assignEssayPracticeToStudent(assignment({essayPracticeId: "attempt-1"}));
    assert.deepEqual(first.assignedAt, now);
    let completedReads = 0;
    onRead = path => {if (path === completedPath("attempt-1") && ++completedReads === 2) throw new Error("Response unavailable");};
    await assert.rejects(() => api.completeAssignedEssayPractice(completion()), /Response unavailable/);
    const count = writes.length;
    onRead = null;
    const saved = await api.completeAssignedEssayPractice(completion({essayText: "A retry should not replace the original."}));
    assert.equal(saved.essayText, completion().essayText); assert.equal(writes.length, count);
  });

  test(layer + ": concurrent submissions retain exactly one completed essay and return the same result", async () => {
    put(assignedPath("attempt-1"), assignmentRecord());
    const results = await Promise.all([
      api.completeAssignedEssayPractice(completion({essayText: "First submission"})),
      api.completeAssignedEssayPractice(completion({essayText: "Second submission"})),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(writes.filter(item => item.path === completedPath("attempt-1")).length, 1);
    assert.equal(documents.has(assignedPath("attempt-1")), false);
  });

  test(layer + ": retry cleans up a stale matching assignment without changing completion history", async () => {
    put(assignedPath("attempt-1"), assignmentRecord());
    const saved = await api.completeAssignedEssayPractice(completion());
    put(assignedPath("attempt-1"), assignmentRecord());
    assert.deepEqual(await api.completeAssignedEssayPractice(completion()), saved);
    assert.equal(documents.has(assignedPath("attempt-1")), false);
    put(assignedPath("attempt-1"), assignmentRecord({topicId: "other-topic"}));
    await assert.rejects(() => api.completeAssignedEssayPractice(completion()), /conflicts/);
    assert.equal(documents.has(assignedPath("attempt-1")), true);
    assert.deepEqual(await api.getCompletedEssayPractice(ref("attempt-1")), saved);
  });

  test(layer + ": list filters apply in Firestore, paginate full records and scope cursors to student, kind and filters", async () => {
    for (const id of ["a", "b", "c", "d", "e"]) {
      const data = assignmentRecord({topicId: id === "d" ? "topic-2" : "topic-1", syllabusId: id === "e" ? "syllabus-2" : "syllabus-1"});
      put(assignedPath(id), data);
      put(completedPath(id), {...data, completedAt: now, essayText: "Essay " + id, timeTakenSeconds: 60});
    }
    put(assignedPath("foreign", "student-2"), assignmentRecord());
    const input = {studentId: "student-1", syllabusId: "syllabus-1", topicId: "topic-1", limit: 2};
    for (const name of ["listAssignedEssayPractices", "listCompletedEssayPractices"]) {
      const first = await api[name](input);
      assert.deepEqual(first.practices.map(item => item.essayPracticeId), ["a", "b"]);
      assert.equal(first.practices[0].essayQuestionId, "question-1"); assert.ok(first.nextCursor);
      const second = await api[name]({...input, limit: 1, cursor: first.nextCursor});
      assert.deepEqual(second.practices.map(item => item.essayPracticeId), ["c"]); assert.equal(second.nextCursor, null);
      assert.equal(queries.at(-1).limit, 2); assert.equal(queries.at(-1).topicId, "topic-1");
      const readCount = reads.length;
      for (const changes of [{studentId: "student-2"}, {syllabusId: "syllabus-2"}, {topicId: undefined}, {cursor: "%invalid"}]) {
        await assert.rejects(() => api[name]({...input, cursor: first.nextCursor, ...changes}), /cursor/);
      }
      const other = name === "listAssignedEssayPractices" ? "listCompletedEssayPractices" : "listAssignedEssayPractices";
      await assert.rejects(() => api[other]({...input, cursor: first.nextCursor}), /cursor/);
      assert.equal(reads.length, readCount);
    }
    assert.equal((await api.listAssignedEssayPractices({studentId: "student-1", limit: 100})).practices.length, 5);
    assert.equal((await api.listAssignedEssayPractices({studentId: "student-1", topicId: "topic-2", limit: 100})).practices.length, 1);
    assert.deepEqual(writes, []);
  });

  test(layer + ": invalid inputs fail before data access", async () => {
    for (const input of [null, [], assignment({studentId: ""}), assignment({topicId: "a/b"}),
      assignment({essayQuestionId: 7}), assignment({syllabusId: ".."}), assignment({essayPracticeId: "__reserved__"})]) {
      await assert.rejects(() => api.assignEssayPracticeToStudent(input));
    }
    for (const input of [null, completion({essayText: " "}), completion({essayText: 7}),
      ...[-1, NaN, Infinity, "3", null].map(timeTakenSeconds => completion({timeTakenSeconds})),
      completion({essayPracticeId: "a/b"})]) {
      await assert.rejects(() => api.completeAssignedEssayPractice(input));
    }
    for (const name of ["getAssignedEssayPractice", "getCompletedEssayPractice"]) {
      await assert.rejects(() => api[name]({studentId: "student-1", essayPracticeId: "."}));
    }
    for (const name of ["listAssignedEssayPractices", "listCompletedEssayPractices"]) {
      for (const limit of [undefined, 0, -1, 1.5, 101, "5"]) await assert.rejects(() => api[name]({studentId: "student-1", limit}));
      await assert.rejects(() => api[name]({studentId: "student-1", limit: 5, topicId: null}));
    }
    assert.deepEqual(reads, []); assert.deepEqual(writes, []);
  });
}

test("web requires sign-in for all essay APIs", async () => {
  auth.currentUser = null;
  for (const name of apis) await assert.rejects(() => web[name]({}), /authenticated/);
  assert.deepEqual(reads, []); assert.deepEqual(writes, []);
});

test("web account changes during question lookup or completion reads prevent writes", async () => {
  seedQuestion();
  onRead = path => {if (path.includes("/questions/")) auth.currentUser = {...user, uid: "other-account"};};
  await assert.rejects(() => web.assignEssayPracticeToStudent(assignment()), /account changed/);
  assert.deepEqual(writes, []);
  auth.currentUser = {...user}; onRead = null;
  put(assignedPath("attempt-1"), assignmentRecord());
  onTransactionRead = path => {if (path === assignedPath("attempt-1")) auth.currentUser = null;};
  await assert.rejects(() => web.completeAssignedEssayPractice(completion()), /authenticated/);
  assert.deepEqual(writes, []); assert.equal(documents.has(assignedPath("attempt-1")), true);
});

test("web account changes before returning reads do not disclose the previous account's result", async () => {
  put(assignedPath("attempt-1"), assignmentRecord());
  onRead = () => {auth.currentUser = {...user, uid: "other-account"};};
  await assert.rejects(() => web.getAssignedEssayPractice(ref("attempt-1")), /account changed/);
  assert.deepEqual(writes, []);
});

