import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./student_login_module.js";
import * as webSchema from "../../config/firebase/student_login_schema.js";
import {shiftLoginDate} from "./domain/student_login.js";
import {FirestoreStudentLoginRepository as WebRepository} from "./infrastructure/firestore_student_login_repository.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalBackendOps = {...backendOps};
const originalFirebase = globalThis.firebase;
const RealDate = globalThis.Date;
let clock = new RealDate("2026-10-10T12:00:00Z");
class ClockDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock.getTime()])); }
  static now() { return clock.getTime(); }
}
globalThis.Date = ClockDate;
const documents = new Map();
const versions = new Map();
const writes = [];
const reads = [];
const queries = [];
const callables = [];
const batches = [];
const student = {uid: "student-1", email: "student@example.com", emailVerified: false};
const admin = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...student}};
const scope = {studentId: "student-1"};
const summaryPath = "studentLogins/student-1";
const historyPath = summaryPath + "/history";
const today = "2026-10-10";
const earliest = "2026-08-27";
let readFailure = null;
let readFailurePath = null;
let directReadFailure = null;
let writeFailure = null;
let deleteFailure = null;
let onAdminCheck = null;
let beforeTransactionCommit = null;
let attempts = 0;
let commitCount = 0;

function setClock(iso) { clock = new RealDate(iso); }
function timestamp(value = clock.getTime()) {
  const time = typeof value === "string" ? RealDate.parse(value) : value;
  return {toDate: () => new Date(time)};
}
function snapshot(recordPath) {
  const data = documents.get(recordPath);
  return {id: recordPath.split("/").at(-1), path: recordPath, exists: documents.has(recordPath), data: () => data};
}
function checkRead(recordPath, direct = false) {
  reads.push(recordPath);
  if (readFailure && (!readFailurePath || recordPath === readFailurePath)) throw readFailure;
  if (direct && directReadFailure === recordPath) throw new Error("Post-commit read failed");
}
function reference(recordPath) {
  return {
    id: recordPath.split("/").at(-1), path: recordPath,
    async get() { checkRead(recordPath, true); return snapshot(recordPath); },
  };
}
function fieldName(field) { return typeof field === "string" ? field : "__name__"; }
function compare(a, b, direction) {
  const result = a < b ? -1 : a > b ? 1 : 0;
  return direction === "desc" ? -result : result;
}
function collection(collectionPath, filters = [], ordering = "asc", cursor = null, size = null) {
  return {
    doc(id) { return reference(collectionPath + "/" + id); },
    where(field, operator, value) {
      assert.equal(fieldName(field), "__name__", "Login queries must use date/document IDs.");
      return collection(collectionPath, [...filters, {operator, value}], ordering, cursor, size);
    },
    orderBy(field, direction) {
      assert.equal(fieldName(field), "__name__");
      return collection(collectionPath, filters, direction, cursor, size);
    },
    startAfter(record) { return collection(collectionPath, filters, ordering, typeof record === "string" ? record : record.id, size); },
    limit(value) { return collection(collectionPath, filters, ordering, cursor, value); },
    async get() {
      checkRead(collectionPath, true);
      queries.push({path: collectionPath, filters, ordering, cursor, size});
      let records = [...documents.keys()].filter((key) => key.startsWith(collectionPath + "/")
        && key.slice(collectionPath.length + 1).split("/").length === 1).map(snapshot);
      for (const {operator, value} of filters) {
        records = records.filter(record => operator === ">=" ? record.id >= value
          : operator === "<=" ? record.id <= value : operator === "<" ? record.id < value : false);
      }
      records.sort((a, b) => compare(a.id, b.id, ordering));
      if (cursor !== null) records = records.filter(record => compare(record.id, cursor, ordering) > 0);
      if (size !== null) records = records.slice(0, size);
      return {docs: records};
    },
  };
}
function applyWrite(write, savedAt) {
  if (write.operation === "delete") {
    documents.delete(write.path);
  } else {
    const resolved = {...write.data};
    for (const field of ["lastLoginAt", "updatedAt", "loggedInAt", "earnedAt"]) {
      if (Object.hasOwn(resolved, field)) resolved[field] = savedAt;
    }
    documents.set(write.path, write.options?.merge ? {...documents.get(write.path), ...resolved} : resolved);
  }
  versions.set(write.path, (versions.get(write.path) || 0) + 1);
  writes.push(write);
}
const db = {
  collection,
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 100; attempt++) {
      attempts++;
      const readVersions = new Map();
      const pending = [];
      const result = await callback({
        async get(ref) {
          assert.equal(pending.length, 0, "All transaction reads must precede writes.");
          checkRead(ref.path);
          readVersions.set(ref.path, versions.get(ref.path) || 0);
          return snapshot(ref.path);
        },
        set(ref, data, options) { pending.push({path: ref.path, data, options, operation: "set"}); },
      });
      beforeTransactionCommit?.();
      if ([...readVersions].some(([recordPath, version]) => (versions.get(recordPath) || 0) !== version)) continue;
      if (writeFailure && pending.length) throw writeFailure;
      if (pending.length) {
        commitCount++;
        const savedAt = timestamp();
        for (const write of pending) applyWrite(write, savedAt);
      }
      return result;
    }
    throw new Error("Too many transaction retries");
  },
  batch() {
    const pending = [];
    return {
      delete(ref) { pending.push({path: ref.path, operation: "delete"}); },
      async commit() {
        if (deleteFailure) throw deleteFailure;
        assert.ok(pending.length <= 400, "Cleanup must use bounded batches.");
        batches.push(pending);
        for (const write of pending) applyWrite(write);
      },
    };
  },
};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
firestore.FieldPath = {documentId: () => "__name__"};
const app = {
  firestore: () => db, auth: () => auth,
  functions(region) {
    assert.equal(region, "us-central1");
    return {httpsCallable(name) {
      assert.equal(name, "isCurrentUserSiteAdmin", "Login APIs must not introduce callable gateways.");
      return async () => {
        callables.push(name);
        const user = auth.currentUser;
        const result = {email: user?.email || null, emailVerified: user?.emailVerified === true,
          isAdmin: user?.email === admin.email, bootstrapAvailable: false};
        onAdminCheck?.();
        return {data: result};
      };
    }};
  },
};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.getDocumentRef = (collectionPath, id) => reference(collectionPath + "/" + id);
backendOps.getCollectionRef = collection;
backendOps.getFirestoreDb = () => db;
backendOps.readDocument = async (collectionPath, id) => {
  const record = await reference(collectionPath + "/" + id).get();
  return record.exists ? {...record.data(), id: record.id} : null;
};
const backend = require("../../../functions/features/student_login/student_login_module.js");
const backendSchema = require("../../../functions/schema/student_login_schema.js");
const {FirestoreStudentLoginRepository: BackendRepository} = require("../../../functions/features/student_login/infrastructure/firestore_student_login_repository.js");
const {pruneAllStudentLoginHistory} = require("../../../functions/features/student_login/application/prune_all_student_login_history.js");
const rewardFeature = require("../../../functions/features/reward/reward_module.js");
const {processStudentLoginRecorded} = require("../../../functions/triggers/student_login_reward_trigger.js");

function seedHistory(loginDate, studentId = scope.studentId) {
  documents.set("studentLogins/" + studentId + "/history/" + loginDate, {loggedInAt: timestamp(loginDate + "T12:00:00Z")});
}
function seedSummary({studentId = scope.studentId, lastLoginDate = "2026-10-09", totalLoginDays = 200, currentStreakDays = 60, longestStreakDays = 90, ...extra} = {}) {
  documents.set("studentLogins/" + studentId, {
    lastLoginDate, lastLoginAt: timestamp(lastLoginDate + "T12:00:00Z"),
    totalLoginDays, currentStreakDays, longestStreakDays,
    updatedAt: timestamp(lastLoginDate + "T12:00:00Z"), ...extra,
  });
}
beforeEach(() => {
  documents.clear(); versions.clear(); writes.length = 0; reads.length = 0; queries.length = 0; callables.length = 0; batches.length = 0;
  readFailure = null; readFailurePath = null; directReadFailure = null; writeFailure = null; deleteFailure = null;
  onAdminCheck = null; beforeTransactionCommit = null; attempts = 0; commitCount = 0;
  auth.currentUser = {...student};
  setClock("2026-10-10T12:00:00Z");
  documents.set("rewards/config", {dailyLoginCoins: 1});
  documents.set("students/student-1", {name: "Student"});
});
after(() => {
  Object.assign(backendOps, originalBackendOps);
  globalThis.Date = RealDate;
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

test("backend and web share the 45-day UTC schema and all feature APIs", () => {
  assert.deepEqual(webSchema.studentLoginSchema, backendSchema.studentLoginSchema);
  assert.equal(web.STUDENT_LOGIN_TIME_ZONE, "UTC");
  assert.equal(backend.STUDENT_LOGIN_TIME_ZONE, "UTC");
  assert.equal(web.STUDENT_LOGIN_HISTORY_DAYS, 45);
  assert.deepEqual(webSchema.studentLoginSchema.subcollections.history.fields, {
    loggedInAt: "timestamp",
    currentStreakDays: {type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER},
  });
  for (const api of [backend, web]) {
    for (const name of ["recordStudentLogin", "getStudentLoginSummary", "getStudentLoginRecord", "hasStudentLoggedInOnDate", "listStudentLoginHistory", "pruneStudentLoginHistory"]) {
      assert.equal(typeof api[name], "function");
    }
  }
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": missing summary/history reads do not create a record or award coins", async () => {
    const before = [...documents.entries()];
    assert.equal(await api.getStudentLoginSummary(scope), null);
    assert.equal(await api.getStudentLoginRecord({...scope, loginDate: today}), null);
    assert.equal(await api.hasStudentLoggedInOnDate({...scope, loginDate: today}), false);
    assert.deepEqual(await api.listStudentLoginHistory(scope), {entries: [], nextCursor: null});
    assert.deepEqual(await api.pruneStudentLoginHistory(scope), {deletedCount: 0});
    assert.deepEqual([...documents.entries()], before);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": the first login writes one daily record and lifetime summary atomically", async () => {
    const result = await api.recordStudentLogin({...scope, loginDate: "2099-01-01", loggedInAt: new Date(0), totalLoginDays: 999, currentStreakDays: 999});
    assert.equal(result.isFirstLoginOfDay, true);
    assert.equal(result.loginRecord.studentId, scope.studentId);
    assert.equal(result.loginRecord.loginDate, today);
    assert.equal(result.loginRecord.loggedInAt.getTime(), clock.getTime());
    assert.equal(result.summary.totalLoginDays, 1);
    assert.equal(result.summary.currentStreakDays, 1);
    assert.equal(result.summary.longestStreakDays, 1);
    assert.equal(result.summary.lastLoginDate, today);
    assert.equal(result.summary.lastLoginAt.getTime(), clock.getTime());
    assert.ok(Object.isFrozen(result.summary));
    assert.ok(Object.isFrozen(result.loginRecord));
    assert.equal(commitCount, 1);
    assert.deepEqual(writes.map(write => write.path), [summaryPath, historyPath + "/" + today]);
    assert.deepEqual(Object.keys(documents.get(historyPath + "/" + today)), ["loggedInAt", "currentStreakDays"]);
    assert.equal(result.loginRecord.currentStreakDays, 1);
    assert.equal(documents.get(historyPath + "/" + today).currentStreakDays, 1);
    assert.equal(await api.hasStudentLoggedInOnDate({...scope, loginDate: today}), true);
    assert.deepEqual(await api.getStudentLoginSummary(scope), result.summary);
    assert.deepEqual(documents.get("rewards/config"), {dailyLoginCoins: 1});
    assert.deepEqual(documents.get("students/student-1"), {name: "Student"});
    assert.ok(![...documents.keys()].some(key => key.startsWith("rewards/student-1")));
  });

  test(layer + ": further logins on the same day make no writes and retain the first timestamp", async () => {
    const first = await api.recordStudentLogin(scope);
    const before = [...documents.entries()];
    const writeCount = writes.length;
    queries.length = 0;
    setClock("2026-10-10T23:59:59.999Z");
    const again = await api.recordStudentLogin(scope);
    assert.equal(again.isFirstLoginOfDay, false);
    assert.deepEqual(again.loginRecord, first.loginRecord);
    assert.deepEqual(again.summary, first.summary);
    assert.equal(writes.length, writeCount);
    assert.deepEqual([...documents.entries()], before);
    assert.deepEqual(queries, [], "Same-day calls must not run pruning either.");
  });

  test(layer + ": simultaneous same-day logins create exactly one record and increment", async () => {
    const results = await Promise.all(Array.from({length: 8}, () => api.recordStudentLogin(scope)));
    assert.equal(results.filter(result => result.isFirstLoginOfDay).length, 1);
    assert.equal(writes.length, 2);
    assert.equal(commitCount, 1);
    assert.ok(attempts > 8);
    assert.equal((await api.getStudentLoginSummary(scope)).totalLoginDays, 1);
    assert.equal((await api.listStudentLoginHistory(scope)).entries.length, 1);
  });

  test(layer + ": consecutive days extend streaks, missed days restart them and longest streak is retained", async () => {
    await api.recordStudentLogin(scope);
    setClock("2026-10-11T12:00:00Z");
    const second = await api.recordStudentLogin(scope);
    assert.equal(second.summary.currentStreakDays, 2);
    assert.equal(second.loginRecord.currentStreakDays, 2);
    assert.equal(documents.get(historyPath + "/2026-10-10").currentStreakDays, 1);
    assert.equal(documents.get(historyPath + "/2026-10-11").currentStreakDays, 2);
    setClock("2026-10-12T12:00:00Z");
    assert.equal((await api.getStudentLoginSummary(scope)).currentStreakDays, 2);
    const before = writes.length;
    setClock("2026-10-13T12:00:00Z");
    const stale = await api.getStudentLoginSummary(scope);
    assert.equal(stale.currentStreakDays, 0);
    assert.equal(stale.longestStreakDays, 2);
    assert.equal(writes.length, before);
    assert.equal(documents.get(summaryPath).currentStreakDays, 2, "Read-time expiry must not overwrite stored counters.");
    const restarted = await api.recordStudentLogin(scope);
    assert.equal(restarted.summary.currentStreakDays, 1);
    assert.equal(restarted.loginRecord.currentStreakDays, 1);
    assert.equal(restarted.summary.longestStreakDays, 2);
    assert.equal(restarted.summary.totalLoginDays, 3);
  });

  test(layer + ": UTC midnight determines new days independently of local date offsets", async () => {
    setClock("2026-10-11T07:59:59.999+08:00");
    assert.equal((await api.recordStudentLogin(scope)).loginRecord.loginDate, "2026-10-10");
    setClock("2026-10-11T08:00:00+08:00");
    const next = await api.recordStudentLogin(scope);
    assert.equal(next.loginRecord.loginDate, "2026-10-11");
    assert.equal(next.summary.currentStreakDays, 2);
  });

  test(layer + ": retrying across midnight recalculates the day before writing", async () => {
    let invalidated = false;
    setClock("2026-10-10T23:59:59.999Z");
    beforeTransactionCommit = () => {
      if (invalidated) return;
      invalidated = true;
      versions.set(summaryPath, 1);
      setClock("2026-10-11T00:00:00Z");
    };
    const result = await api.recordStudentLogin(scope);
    assert.equal(result.loginRecord.loginDate, "2026-10-11");
    assert.equal(result.summary.totalLoginDays, 1);
    assert.equal(documents.has(historyPath + "/2026-10-10"), false);
    assert.equal(writes.length, 2);
    assert.equal(attempts, 2);
  });

  test(layer + ": streak calculation handles leap days and year boundaries", async () => {
    setClock("2024-02-28T12:00:00Z");
    await api.recordStudentLogin(scope);
    setClock("2024-02-29T12:00:00Z");
    assert.equal((await api.recordStudentLogin(scope)).summary.currentStreakDays, 2);
    setClock("2024-03-01T12:00:00Z");
    assert.equal((await api.recordStudentLogin(scope)).summary.currentStreakDays, 3);
    setClock("2024-12-31T12:00:00Z");
    assert.equal((await api.recordStudentLogin(scope)).summary.currentStreakDays, 1);
    setClock("2025-01-01T12:00:00Z");
    assert.equal((await api.recordStudentLogin(scope)).summary.currentStreakDays, 2);
  });

  test(layer + ": history reads include today and the previous 44 dates, excluding older and future dates", async () => {
    for (let offset = 0; offset <= 60; offset++) seedHistory(shiftLoginDate(today, -offset));
    seedHistory("2026-10-11");
    const result = await api.listStudentLoginHistory({...scope, limit: 45});
    assert.equal(result.entries.length, 45);
    assert.equal(result.entries[0].loginDate, today);
    assert.equal(result.entries.at(-1).loginDate, earliest);
    assert.equal(result.nextCursor, null);
    assert.equal(queries.at(-1).size, 46);
    assert.equal(writes.length, 0);
    assert.equal(await api.hasStudentLoggedInOnDate({...scope, loginDate: earliest}), true);
    for (const loginDate of ["2026-08-26", "2026-10-11"]) {
      await assert.rejects(() => api.hasStudentLoggedInOnDate({...scope, loginDate}), error => error.code === "out-of-range");
    }
  });

  test(layer + ": only dates with logins count; retention is 45 calendar days rather than 45 entries", async () => {
    seedHistory(today);
    seedHistory(earliest);
    seedHistory("2026-08-26");
    const result = await api.listStudentLoginHistory(scope);
    assert.deepEqual(result.entries.map(entry => entry.loginDate), [today, earliest]);
    assert.equal(result.nextCursor, null);
    assert.equal(await api.hasStudentLoggedInOnDate({...scope, loginDate: "2026-09-01"}), false);
  });

  test(layer + ": cleanup deletes expired history but preserves lifetime summaries, long streaks and the cutoff date", async () => {
    seedSummary();
    seedHistory("2026-08-26");
    seedHistory(earliest);
    seedHistory(today);
    const summaryBefore = documents.get(summaryPath);
    assert.deepEqual(await api.pruneStudentLoginHistory(scope), {deletedCount: 1});
    assert.equal(documents.has(historyPath + "/2026-08-26"), false);
    assert.equal(documents.has(historyPath + "/" + earliest), true);
    assert.equal(documents.has(historyPath + "/" + today), true);
    assert.equal(documents.get(summaryPath), summaryBefore);
    const summary = await api.getStudentLoginSummary(scope);
    assert.equal(summary.totalLoginDays, 200);
    assert.equal(summary.currentStreakDays, 60);
    assert.equal(summary.longestStreakDays, 90);
    assert.deepEqual(await api.pruneStudentLoginHistory(scope), {deletedCount: 0});
  });

  test(layer + ": a new login prunes old history and permits streaks longer than the retention window", async () => {
    seedSummary();
    seedHistory("2026-08-26");
    const result = await api.recordStudentLogin(scope);
    assert.equal(result.summary.currentStreakDays, 61);
    assert.equal(result.summary.totalLoginDays, 201);
    assert.equal(result.summary.longestStreakDays, 90);
    assert.equal(documents.has(historyPath + "/2026-08-26"), false);
    assert.equal(documents.has(historyPath + "/" + today), true);
  });

  test(layer + ": large cleanup workloads use bounded batches without deleting retained history", async () => {
    seedSummary();
    for (let offset = 45; offset < 866; offset++) seedHistory(shiftLoginDate(today, -offset));
    seedHistory(earliest);
    seedHistory(today);
    assert.deepEqual(await api.pruneStudentLoginHistory(scope), {deletedCount: 821});
    assert.deepEqual(batches.map(batch => batch.length), [400, 400, 21]);
    assert.equal((await api.listStudentLoginHistory(scope)).entries.length, 2);
    assert.equal((await api.getStudentLoginSummary(scope)).totalLoginDays, 200);
  });

  test(layer + ": history pagination is scoped, stable and newest first", async () => {
    for (let offset = 0; offset < 5; offset++) seedHistory(shiftLoginDate(today, -offset));
    seedHistory(today, "student-2");
    const first = await api.listStudentLoginHistory({...scope, limit: 2});
    const second = await api.listStudentLoginHistory({...scope, limit: 2, cursor: first.nextCursor});
    const third = await api.listStudentLoginHistory({...scope, limit: 2, cursor: second.nextCursor});
    assert.deepEqual(first.entries.map(entry => entry.loginDate), ["2026-10-10", "2026-10-09"]);
    assert.deepEqual(first.nextCursor, {...scope, loginDate: "2026-10-09"});
    assert.deepEqual(second.entries.map(entry => entry.loginDate), ["2026-10-08", "2026-10-07"]);
    assert.deepEqual(third.entries.map(entry => entry.loginDate), ["2026-10-06"]);
    assert.equal(third.nextCursor, null);
    assert.ok(first.entries.every(entry => entry.studentId === scope.studentId));
    assert.equal(writes.length, 0);
  });

  test(layer + ": malformed dates, IDs, limits and cursors fail before changing storage", async () => {
    for (const studentId of [undefined, null, "", " ", 1, "nested/id", ".", "..", "__reserved__", "a".repeat(1501)]) {
      for (const method of ["recordStudentLogin", "getStudentLoginSummary", "getStudentLoginRecord", "hasStudentLoggedInOnDate", "listStudentLoginHistory", "pruneStudentLoginHistory"]) {
        await assert.rejects(() => api[method]({studentId, loginDate: today}));
      }
    }
    for (const loginDate of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", " 2026-10-10 ", "", null, new Date()]) {
      await assert.rejects(() => api.hasStudentLoggedInOnDate({...scope, loginDate}));
    }
    for (const limit of [0, -1, 46, "5", 1.5, null, Infinity]) {
      await assert.rejects(() => api.listStudentLoginHistory({...scope, limit}), /limit/);
    }
    for (const cursor of ["date", {}, {studentId: "student-2", loginDate: today}, {...scope, loginDate: "2026-08-26"}, {...scope, loginDate: "2026-10-11"}]) {
      await assert.rejects(() => api.listStudentLoginHistory({...scope, cursor}));
    }
    await assert.rejects(() => api.listStudentLoginHistory({...scope, cursor: {...scope, loginDate: today}}), error => error.code === "not-found");
    assert.deepEqual(writes, []);
  });

  test(layer + ": read and transaction failures do not create partial login state", async () => {
    readFailure = new Error("Read unavailable");
    await assert.rejects(() => api.getStudentLoginSummary(scope), /Read unavailable/);
    await assert.rejects(() => api.hasStudentLoggedInOnDate({...scope, loginDate: today}), /Read unavailable/);
    await assert.rejects(() => api.getStudentLoginRecord({...scope, loginDate: today}), /Read unavailable/);
    await assert.rejects(() => api.listStudentLoginHistory(scope), /Read unavailable/);
    await assert.rejects(() => api.pruneStudentLoginHistory(scope), /Read unavailable/);
    await assert.rejects(() => api.recordStudentLogin(scope), /Read unavailable/);
    readFailure = null;
    writeFailure = new Error("Commit unavailable");
    await assert.rejects(() => api.recordStudentLogin(scope), /Commit unavailable/);
    assert.equal(documents.has(summaryPath), false);
    assert.equal(documents.has(historyPath + "/" + today), false);
    assert.equal(writes.length, 0);
  });

  test(layer + ": retries after a post-commit read failure do not log twice", async () => {
    directReadFailure = historyPath + "/" + today;
    await assert.rejects(() => api.recordStudentLogin(scope), /Post-commit read failed/);
    assert.equal(writes.length, 2);
    directReadFailure = null;
    const retry = await api.recordStudentLogin(scope);
    assert.equal(retry.isFirstLoginOfDay, false);
    assert.equal(retry.summary.totalLoginDays, 1);
    assert.equal(writes.length, 2);
  });

  test(layer + ": cleanup failures preserve login counters and can be retried independently", async () => {
    seedSummary();
    seedHistory("2026-08-26");
    deleteFailure = new Error("Delete unavailable");
    await assert.rejects(() => api.recordStudentLogin(scope), /Delete unavailable/);
    assert.equal(documents.get(summaryPath).totalLoginDays, 201);
    assert.equal(documents.has(historyPath + "/" + today), true);
    const retry = await api.recordStudentLogin(scope);
    assert.equal(retry.isFirstLoginOfDay, false);
    assert.equal(retry.summary.totalLoginDays, 201);
    deleteFailure = null;
    assert.deepEqual(await api.pruneStudentLoginHistory(scope), {deletedCount: 1});
    assert.equal(documents.get(summaryPath).totalLoginDays, 201);
  });

  test(layer + ": malformed stored state, missing daily history and counter overflow are rejected", async () => {
    seedSummary({totalLoginDays: -1});
    await assert.rejects(() => api.getStudentLoginSummary(scope), /safe integer/);
    await assert.rejects(() => api.recordStudentLogin(scope), /safe integer/);
    seedSummary({lastLoginDate: today});
    await assert.rejects(() => api.recordStudentLogin(scope), /history record is missing/);
    documents.delete(summaryPath);
    seedHistory(today);
    await assert.rejects(() => api.recordStudentLogin(scope), /inconsistent/);
    documents.delete(historyPath + "/" + today);
    seedSummary({lastLoginDate: "2026-10-11"});
    await assert.rejects(() => api.recordStudentLogin(scope), /ahead/);
    seedSummary({totalLoginDays: Number.MAX_SAFE_INTEGER});
    await assert.rejects(() => api.recordStudentLogin(scope), /safe integer/);
    documents.set(historyPath + "/" + today, {loggedInAt: null});
    await assert.rejects(() => api.listStudentLoginHistory(scope), /timestamp/);
    assert.equal(writes.length, 0);
  });

  test(layer + ": input is captured before asynchronous work and existing summary metadata is preserved", async () => {
    seedSummary({marker: "preserve"});
    const input = {...scope};
    const pending = api.recordStudentLogin(input);
    input.studentId = "student-2";
    const result = await pending;
    assert.equal(result.loginRecord.studentId, scope.studentId);
    assert.equal(documents.has("studentLogins/student-2"), false);
    assert.equal(documents.get(summaryPath).marker, "preserve");
  });
}

test("web login APIs require sign-in, permit own records and reject other students", async () => {
  auth.currentUser = null;
  for (const method of ["recordStudentLogin", "getStudentLoginSummary", "getStudentLoginRecord", "hasStudentLoggedInOnDate", "listStudentLoginHistory", "pruneStudentLoginHistory"]) {
    await assert.rejects(() => web[method]({...scope, loginDate: today}), /signed in/);
  }
  auth.currentUser = {...student};
  const other = {studentId: "student-2", loginDate: today};
  for (const method of ["recordStudentLogin", "getStudentLoginSummary", "getStudentLoginRecord", "hasStudentLoggedInOnDate", "listStudentLoginHistory", "pruneStudentLoginHistory"]) {
    await assert.rejects(() => web[method](other));
  }
  assert.equal(reads.length, 0);
  assert.equal(writes.length, 0);
});

test("site administrators can use all web APIs for another student", async () => {
  auth.currentUser = {...admin};
  const saved = await web.recordStudentLogin(scope);
  assert.equal(saved.isFirstLoginOfDay, true);
  assert.equal((await web.getStudentLoginSummary(scope)).totalLoginDays, 1);
  assert.equal(await web.hasStudentLoggedInOnDate({...scope, loginDate: today}), true);
  assert.deepEqual(await web.getStudentLoginRecord({...scope, loginDate: today}), saved.loginRecord);
  assert.equal((await web.listStudentLoginHistory(scope)).entries.length, 1);
  assert.deepEqual(await web.pruneStudentLoginHistory(scope), {deletedCount: 0});
  assert.ok(callables.every(name => name === "isCurrentUserSiteAdmin"));
});

test("unverified administrators and account changes cannot access other student login records", async () => {
  auth.currentUser = {...admin, emailVerified: false};
  await assert.rejects(() => web.recordStudentLogin(scope), /Verify/);
  auth.currentUser = {...admin};
  onAdminCheck = () => { auth.currentUser = {...admin, uid: "changed"}; };
  await assert.rejects(() => web.recordStudentLogin(scope), /account changed/);
  auth.currentUser = {...admin};
  onAdminCheck = () => { auth.currentUser = null; };
  await assert.rejects(() => web.getStudentLoginSummary(scope), /signed in/);
  assert.equal(reads.length, 0);
  assert.equal(writes.length, 0);
});

test("daily maintenance cleans inactive students across pages and leaves summaries untouched", async () => {
  for (let index = 0; index < 105; index++) {
    const studentId = "inactive-" + String(index).padStart(3, "0");
    seedSummary({studentId, lastLoginDate: "2026-01-01", totalLoginDays: 100, currentStreakDays: 3, longestStreakDays: 5});
    seedHistory("2026-01-01", studentId);
    seedHistory(earliest, studentId);
  }
  const before = [...documents.entries()].filter(([recordPath]) => recordPath.split("/").length === 2);
  const result = await pruneAllStudentLoginHistory();
  assert.deepEqual(result, {studentCount: 105, deletedCount: 105});
  for (const [recordPath, data] of before) assert.equal(documents.get(recordPath), data);
  assert.equal(queries.filter(query => query.path === "studentLogins").length, 2);
  assert.ok(![...documents.keys()].some(recordPath => recordPath.endsWith("/history/2026-01-01")));
});

test("repository clock injection supports deterministic dates and rejects invalid clocks", async () => {
  for (const Repository of [BackendRepository, WebRepository]) {
    const invalid = new Repository({now: () => new Date(NaN)});
    await assert.rejects(() => invalid.getSummary(scope), /clock/);
    const fixed = new Repository({now: () => new Date("2026-10-10T12:00:00Z")});
    assert.equal(await fixed.hasLoggedInOnDate({...scope, loginDate: today}), false);
  }
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": recording login drives daily and milestone rewards through the backend trigger", async () => {
    seedSummary({lastLoginDate: "2026-10-09", totalLoginDays: 2, currentStreakDays: 2, longestStreakDays: 2});
    documents.set("rewards/config", {...rewardFeature.DEFAULT_REWARD_CONFIG, updatedAt: timestamp(), updatedBy: admin.uid});
    const login = await api.recordStudentLogin(scope);
    assert.equal(login.isFirstLoginOfDay, true);
    assert.equal(login.loginRecord.currentStreakDays, 3);
    const event = {
      id: "login-event", params: {...scope, loginDate: today},
      data: {data: () => documents.get(historyPath + "/" + today)},
    };
    const awarded = await processStudentLoginRecorded(event);
    assert.equal(awarded.dailyReward.award.coins, 1);
    assert.equal(awarded.streakReward.award.coins, 2);
    assert.equal(await rewardFeature.getStudentRewardTotal(scope), 3);
    const beforeWrites = writes.length;
    assert.equal((await api.recordStudentLogin(scope)).isFirstLoginOfDay, false);
    const retried = await processStudentLoginRecorded(event);
    assert.equal(retried.dailyReward.alreadyAwarded, true);
    assert.equal(retried.streakReward.alreadyAwarded, true);
    assert.equal(writes.length, beforeWrites);
    assert.deepEqual(callables, []);
  });
}

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": exact login reads return the saved day snapshot and null after pruning", async () => {
    seedHistory(today);
    documents.set(historyPath + "/" + today, {loggedInAt: timestamp(), currentStreakDays: 3});
    seedHistory("2026-08-26");
    const current = await api.getStudentLoginRecord({...scope, loginDate: today, currentStreakDays: 30});
    assert.equal(current.studentId, scope.studentId);
    assert.equal(current.loginDate, today);
    assert.equal(current.currentStreakDays, 3);
    assert.ok(Object.isFrozen(current));
    const old = await api.getStudentLoginRecord({...scope, loginDate: "2026-08-26"});
    assert.equal(old.loginDate, "2026-08-26");
    assert.equal(old.currentStreakDays, undefined);
    assert.equal(writes.length, 0);
    assert.equal(queries.length, 0);
    assert.deepEqual(reads, [historyPath + "/" + today, historyPath + "/2026-08-26"]);
    await api.pruneStudentLoginHistory(scope);
    assert.equal(await api.getStudentLoginRecord({...scope, loginDate: "2026-08-26"}), null);
    assert.equal((await api.getStudentLoginRecord({...scope, loginDate: today})).currentStreakDays, 3);
  });

  test(layer + ": exact login reads validate dates and malformed saved snapshots", async () => {
    for (const loginDate of ["2026-02-30", "bad/date", null, undefined]) {
      await assert.rejects(() => api.getStudentLoginRecord({...scope, loginDate}));
    }
    assert.equal(reads.length, 0);
    documents.set(historyPath + "/" + today, {loggedInAt: timestamp(), currentStreakDays: 0});
    await assert.rejects(() => api.getStudentLoginRecord({...scope, loginDate: today}), /safe integer/);
    documents.set(historyPath + "/" + today, {loggedInAt: null});
    await assert.rejects(() => api.getStudentLoginRecord({...scope, loginDate: today}), /timestamp/);
    assert.equal(writes.length, 0);
  });
}
