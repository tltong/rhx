import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as web from "./reward_module.js";
import {AwardAssessmentLevelUp as WebAwardAssessmentLevelUp} from "./application/award_assessment_level_up.js";
import {createAssessmentLevelRewardId as webLevelRewardId} from "./domain/assessment_level_reward.js";
import {FirestoreStudentAssessmentProgressRepository as WebAssessmentRepository} from "../student_assessment_progress/infrastructure/firestore_student_assessment_progress_repository.js";
import {AssessPreAssessmentPractice as WebPreAssessment} from "../student_assessment_progress/application/assess_pre_assessment_practice.js";
import {CalculatePreAssessmentLevel as WebPreCalculation} from "../assessment_framework/application/calculate_pre_assessment_level.js";
import * as webAssessment from "../student_assessment_progress/student_assessment_progress_module.js";
import * as webSchema from "../../config/firebase/reward_schema.js";
import {FirestoreStudentRewardRepository as WebStudentRewardRepository} from "./infrastructure/firestore_student_reward_repository.js";
import {AwardAdditionalMissionCompletion as WebAwardAdditionalMissionCompletion} from "./application/award_additional_mission_completion.js";
import {createAdditionalMissionRewardId as webAdditionalMissionRewardId} from "./domain/additional_mission_reward_id.js";
import {AwardDailyMissionCompletion as WebAwardDailyMissionCompletion} from "./application/award_daily_mission_completion.js";
import {AwardStudentLogin as WebAwardStudentLogin} from "./application/award_student_login.js";
import * as webLoginFeature from "../student_login/student_login_module.js";
import {StudentCoinBalanceController} from "../student/pages/landing/student_coin_balance_controller.js";
import {createDailyMissionRewardId as webDailyMissionRewardId} from "./domain/daily_mission_reward_id.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalBackendOps = {...backendOps};
const originalFirebase = globalThis.firebase;
const documents = new Map();
const versions = new Map();
const writes = [];
const reads = [];
const queries = [];
const callables = [];
const subscriptions = [];
const admin = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...admin}};
const studentScope = {studentId: "student-1"};
const scope = {...studentScope, categoryId: web.RewardCategory.DAILY_LOGIN};
const studentPath = "rewards/student-1";
const categoryPath = studentPath + "/categories/dailyLogin";
const historyPath = categoryPath + "/history";
const baseSeconds = Date.parse("2026-10-10T00:00:00Z") / 1000;
let commitCount = 0;
let transactionAttempts = 0;
let readFailure = null;
let directReadFailure = null;
let writeFailure = null;
let onAdminCheck = null;

function timestamp(seconds = baseSeconds, nanoseconds = 0) {
  return {seconds, nanoseconds, toDate: () => new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6))};
}
function snapshot(recordPath) {
  const data = documents.get(recordPath);
  return {id: recordPath.split("/").at(-1), path: recordPath, exists: documents.has(recordPath), data: () => data};
}
function checkRead(recordPath, direct = false) {
  reads.push(recordPath);
  if (readFailure) throw readFailure;
  if (direct && directReadFailure === recordPath) throw new Error("Post-commit read failed");
}
function reference(recordPath) {
  return {
    id: recordPath.split("/").at(-1), path: recordPath,
    async get() { checkRead(recordPath, true); return snapshot(recordPath); },
    onSnapshot(onChange, onError) {
      checkRead(recordPath, true);
      const subscription = {path: recordPath, onChange, onError, active: true};
      subscriptions.push(subscription);
      onChange(snapshot(recordPath));
      return () => {subscription.active = false;};
    },
  };
}
function compareRecords(a, b, ordering) {
  for (const {field, direction} of ordering) {
    let comparison;
    if (field === "earnedAt") {
      const first = a.data().earnedAt;
      const second = b.data().earnedAt;
      comparison = first.seconds - second.seconds || first.nanoseconds - second.nanoseconds;
    } else {
      comparison = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }
    if (comparison) return direction === "desc" ? -comparison : comparison;
  }
  return 0;
}
function collection(collectionPath, ordering = [], cursor = null, size = null, filters = []) {
  return {
    doc(id) { return reference(collectionPath + "/" + id); },
    where(field, operator, value) {
      return collection(collectionPath, ordering, cursor, size, [
        ...filters, {field: typeof field === "string" ? field : "__name__", operator, value},
      ]);
    },
    orderBy(field, direction) {
      return collection(collectionPath, [...ordering, {field: typeof field === "string" ? field : "__name__", direction}], cursor, size, filters);
    },
    startAfter(record) { return collection(collectionPath, ordering, record, size, filters); },
    limit(value) { return collection(collectionPath, ordering, cursor, value, filters); },
    async get() {
      checkRead(collectionPath, true);
      queries.push({path: collectionPath, ordering, cursor, size});
      let records = [...documents.keys()].filter((key) => key.startsWith(collectionPath + "/")
        && key.slice(collectionPath.length + 1).split("/").length === 1).map(snapshot);
      for (const {field, operator, value} of filters) {
        records = records.filter(record => {
          const actual = field === "__name__" ? record.id : record.data()[field];
          if (operator === ">=") return actual >= value;
          if (operator === "<=") return actual <= value;
          throw new Error("Unsupported test query operator: " + operator);
        });
      }
      records.sort((a, b) => compareRecords(a, b, ordering));
      if (cursor) records = records.filter((record) => compareRecords(record, cursor, ordering) > 0);
      if (size !== null) records = records.slice(0, size);
      return {docs: records};
    },
  };
}
const db = {
  collection,
  async runTransaction(callback) {
    // Optimistic retries emulate Firestore: all read versions must still match
    // before any buffered writes commit.
    for (let attempt = 0; attempt < 100; attempt++) {
      transactionAttempts++;
      const readVersions = new Map();
      const pending = [];
      const transaction = {
        async get(ref) {
          assert.equal(pending.length, 0, "All transaction reads must precede writes.");
          checkRead(ref.path);
          readVersions.set(ref.path, versions.get(ref.path) || 0);
          return snapshot(ref.path);
        },
        set(ref, data, options) { pending.push({path: ref.path, data, options}); },
      };
      const result = await callback(transaction);
      if ([...readVersions].some(([recordPath, version]) => (versions.get(recordPath) || 0) !== version)) continue;
      if (writeFailure && pending.length) throw writeFailure;
      if (pending.length) {
        const savedAt = timestamp(baseSeconds, ++commitCount * 100);
        for (const write of pending) {
          const resolved = {...write.data};
          if (Object.hasOwn(resolved, "earnedAt")) resolved.earnedAt = savedAt;
          if (Object.hasOwn(resolved, "updatedAt")) resolved.updatedAt = savedAt;
          documents.set(write.path, write.options?.merge ? {...documents.get(write.path), ...resolved} : resolved);
          versions.set(write.path, (versions.get(write.path) || 0) + 1);
          writes.push({...write, data: resolved});
        }
        for (const subscription of subscriptions) {
          if (subscription.active && pending.some(write => write.path === subscription.path)) {
            subscription.onChange(snapshot(subscription.path));
          }
        }
      }
      return result;
    }
    throw new Error("Too many transaction retries");
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
      assert.equal(name, "isCurrentUserSiteAdmin", "Rewards must use feature APIs rather than new callable endpoints.");
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
backendOps.readCollectionIds = async collectionPath => (await collection(collectionPath).get()).docs.map(record => record.id);
backendOps.readCollection = async collectionPath => (await collection(collectionPath).get()).docs.map(record => ({...record.data(), id: record.id}));
const backend = require("../../../functions/features/reward/reward_module.js");
const backendSchema = require("../../../functions/schema/reward_schema.js");
const {AwardAssessmentLevelUp} = require("../../../functions/features/reward/application/award_assessment_level_up");
const {createAssessmentLevelRewardId} = require("../../../functions/features/reward/domain/assessment_level_reward");
const backendAssessment = require("../../../functions/features/student_assessment_progress/student_assessment_progress_module");
const {FirestoreStudentAssessmentProgressRepository} = require("../../../functions/features/student_assessment_progress/infrastructure/firestore_student_assessment_progress_repository");
const {AssessPreAssessmentPractice} = require("../../../functions/features/student_assessment_progress/application/assess_pre_assessment_practice");
const {CalculatePreAssessmentLevel} = require("../../../functions/features/assessment_framework/application/calculate_pre_assessment_level");
const {AwardStudentLogin} = require("../../../functions/features/reward/application/award_student_login.js");
const loginFeature = require("../../../functions/features/student_login/student_login_module.js");
const {FirestoreStudentRewardRepository} = require("../../../functions/features/reward/infrastructure/firestore_student_reward_repository.js");
const {shiftLoginDate} = require("../../../functions/features/student_login/domain/student_login.js");
const {AwardAdditionalMissionCompletion} = require("../../../functions/features/reward/application/award_additional_mission_completion.js");
const {createAdditionalMissionRewardId} = require("../../../functions/features/reward/domain/additional_mission_reward_id.js");
const {AwardDailyMissionCompletion} = require("../../../functions/features/reward/application/award_daily_mission_completion.js");
const {assessCompletedStudentPractice} = require("../../../functions/triggers/student_practice_completion_trigger.js");
const {processStudentLoginRecorded} = require("../../../functions/triggers/student_login_reward_trigger.js");

function reward(changes = {}) {
  return {...scope, awardId: "login-2026-10-10", coins: 1, sourceId: "2026-10-10",
    details: {loginDate: "2026-10-10"}, ...changes};
}
function seedAward(awardId, {studentId = scope.studentId, categoryId = scope.categoryId, coins = 1, earnedAt = timestamp(), sourceId = awardId, details = {}} = {}) {
  documents.set(["rewards", studentId, "categories", categoryId, "history", awardId].join("/"), {coins, earnedAt, sourceId, details});
}
beforeEach(() => {
  documents.clear(); versions.clear(); writes.length = 0; reads.length = 0; queries.length = 0; callables.length = 0;
  subscriptions.length = 0;
  commitCount = 0; transactionAttempts = 0; readFailure = null; directReadFailure = null; writeFailure = null; onAdminCheck = null;
  auth.currentUser = {...admin};
  documents.set("rewards/config", {dailyLoginCoins: 1});
  documents.set("rewards/config/assessmentFrameworks/framework-1", {levelCoins: {level_a: 20}});
});
after(() => {
  Object.assign(backendOps, originalBackendOps);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});

test("both layers share student reward schema, enum and feature API exports", () => {
  assert.deepEqual(webSchema.studentRewardSchema, backendSchema.studentRewardSchema);
  assert.deepEqual(web.RewardCategory, backend.RewardCategory);
  assert.deepEqual(Object.values(web.RewardCategory), [
    "dailyLogin", "dailyMissionCompletion", "bonusMissionCompletion", "assessmentLevel", "loginStreak",
  ]);
  assert.ok(Object.isFrozen(web.RewardCategory));
  for (const api of [backend, web]) {
    for (const name of ["awardAssessmentLevelUp", "awardAdditionalMissionCompletion", "awardDailyMissionCompletion", "awardStudentLogin", "saveStudentReward", "getStudentRewardTotal", "getStudentRewardCategoryTotal", "listStudentRewardHistory", "listRecentStudentRewardActivities"]) {
      assert.equal(typeof api[name], "function");
    }
  }
});
for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": missing totals and history return zero/empty without creating documents", async () => {
    const before = [...documents.entries()];
    assert.equal(await api.getStudentRewardTotal(studentScope), 0);
    assert.equal(await api.getStudentRewardCategoryTotal(scope), 0);
    assert.deepEqual(await api.listStudentRewardHistory(scope), {entries: [], nextCursor: null});
    assert.deepEqual(await api.listRecentStudentRewardActivities({...studentScope, limit: 5}), []);
    assert.deepEqual([...documents.entries()], before);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": recent activities merge every category, exclude zero awards and honor the input limit", async () => {
    seedAward("zero-newest", {coins: 0, earnedAt: timestamp(baseSeconds + 100)});
    seedAward("zero-second", {coins: 0, earnedAt: timestamp(baseSeconds + 90)});
    seedAward("zero-third", {coins: 0, earnedAt: timestamp(baseSeconds + 80)});
    seedAward("daily-login", {coins: 1, earnedAt: timestamp(baseSeconds + 70)});
    seedAward("bonus", {categoryId: api.RewardCategory.BONUS_MISSION_COMPLETION, coins: 20,
      earnedAt: timestamp(baseSeconds + 75)});
    seedAward("daily-mission", {categoryId: api.RewardCategory.DAILY_MISSION_COMPLETION, coins: 25,
      earnedAt: timestamp(baseSeconds + 60)});
    const recent = await api.listRecentStudentRewardActivities({...studentScope, limit: 2});
    assert.ok(Object.isFrozen(recent));
    assert.deepEqual(recent.map(entry => [entry.awardId, entry.coins]), [["bonus", 20], ["daily-login", 1]]);
    assert.ok(recent.every(entry => entry.coins > 0));
    assert.ok(queries.filter(query => query.path === historyPath).length >= 2,
      "The API must read past leading zero-coin markers.");
  });

  test(layer + ": recent activities retain Firestore nanosecond ordering across categories", async () => {
    seedAward("earlier-nanoseconds", {coins: 1, earnedAt: timestamp(baseSeconds, 100)});
    seedAward("later-nanoseconds", {categoryId: api.RewardCategory.BONUS_MISSION_COMPLETION,
      coins: 20, earnedAt: timestamp(baseSeconds, 900)});
    const recent = await api.listRecentStudentRewardActivities({...studentScope, limit: 2});
    assert.deepEqual(recent.map(entry => entry.awardId), ["later-nanoseconds", "earlier-nanoseconds"]);
    assert.equal(recent[0].earnedAt.getTime(), recent[1].earnedAt.getTime(),
      "JavaScript Dates intentionally cannot represent this ordering precision.");
  });

  test(layer + ": recent activity requires a bounded caller-provided limit", async () => {
    for (const limit of [undefined, null, 0, -1, 1.5, "5", 51, Infinity]) {
      await assert.rejects(() => api.listRecentStudentRewardActivities({...studentScope, limit}), /limit/);
    }
    assert.deepEqual(queries, []);
  });

  test(layer + ": an award commits history and both totals atomically with server timestamps", async () => {
    const input = reward({coins: 25, earnedAt: new Date(0), updatedAt: new Date(0)});
    const saved = await api.saveStudentReward(input);
    assert.equal(saved.totalCoins, 25);
    assert.equal(saved.categoryTotalCoins, 25);
    assert.equal(saved.alreadyAwarded, false);
    assert.equal(saved.award.awardId, input.awardId);
    assert.equal(saved.award.earnedAt.getTime(), baseSeconds * 1000);
    assert.equal(saved.award.sourceId, input.sourceId);
    assert.deepEqual(saved.award.details, input.details);
    assert.ok(Object.isFrozen(saved.award));
    assert.ok(Object.isFrozen(saved.award.details));
    assert.deepEqual(writes.map(({path}) => path), [studentPath, categoryPath, historyPath + "/" + input.awardId]);
    assert.equal(commitCount, 1);
    assert.deepEqual(Object.keys(documents.get(studentPath)).sort(), ["totalCoins", "updatedAt"]);
    assert.deepEqual(Object.keys(documents.get(historyPath + "/" + input.awardId)).sort(), ["coins", "details", "earnedAt", "sourceId"]);
    assert.equal(await api.getStudentRewardTotal(studentScope), 25);
    assert.equal(await api.getStudentRewardCategoryTotal(scope), 25);
    assert.deepEqual((await api.listStudentRewardHistory(scope)).entries, [saved.award]);
    assert.deepEqual(documents.get("rewards/config"), {dailyLoginCoins: 1});
    assert.deepEqual(documents.get("rewards/config/assessmentFrameworks/framework-1"), {levelCoins: {level_a: 20}});
  });

  test(layer + ": updating totals preserves unrelated student and category fields", async () => {
    documents.set(studentPath, {totalCoins: 10, updatedAt: timestamp(), marker: "student metadata"});
    documents.set(categoryPath, {totalCoins: 3, updatedAt: timestamp(), marker: "category metadata"});
    const saved = await api.saveStudentReward(reward({coins: 2}));
    assert.equal(saved.totalCoins, 12);
    assert.equal(saved.categoryTotalCoins, 5);
    assert.equal(documents.get(studentPath).marker, "student metadata");
    assert.equal(documents.get(categoryPath).marker, "category metadata");
    assert.equal(writes.length, 3);
  });

  test(layer + ": all categories and other students have independent histories and totals", async () => {
    let sum = 0;
    for (const [index, categoryId] of Object.values(api.RewardCategory).entries()) {
      const coins = (index + 1) * 10;
      sum += coins;
      const saved = await api.saveStudentReward(reward({categoryId, awardId: "shared-id", coins}));
      assert.equal(saved.totalCoins, sum);
      assert.equal(saved.categoryTotalCoins, coins);
      assert.equal(await api.getStudentRewardCategoryTotal({...studentScope, categoryId}), coins);
      assert.equal((await api.listStudentRewardHistory({...studentScope, categoryId})).entries.length, 1);
    }
    const other = await api.saveStudentReward(reward({studentId: "student-2", awardId: "shared-id", coins: 99}));
    assert.equal(other.totalCoins, 99);
    assert.equal(await api.getStudentRewardTotal(studentScope), sum);
    assert.equal((await api.listStudentRewardHistory(scope)).entries[0].coins, 10);
  });

  test(layer + ": identical retries do not increment totals, replace timestamps or append history", async () => {
    const first = await api.saveStudentReward(reward({details: {loginDate: "2026-10-10", extra: {b: 2, a: [1, {c: true}]}}}));
    await api.saveStudentReward(reward({awardId: "another", coins: 20}));
    const before = [...documents.entries()];
    const beforeWriteCount = writes.length;
    const retry = await api.saveStudentReward(reward({details: {extra: {a: [1, {c: true}], b: 2}, loginDate: "2026-10-10"}}));
    assert.equal(retry.alreadyAwarded, true);
    assert.equal(retry.totalCoins, 21);
    assert.equal(retry.categoryTotalCoins, 21);
    assert.deepEqual(retry.award, first.award);
    assert.deepEqual([...documents.entries()], before);
    assert.equal(writes.length, beforeWriteCount);
    assert.equal((await api.listStudentRewardHistory(scope)).entries.length, 2);
  });

  test(layer + ": a reused award ID with different content is rejected without changing totals", async () => {
    await api.saveStudentReward(reward());
    const before = [...documents.entries()];
    for (const changes of [{coins: 2}, {sourceId: "another"}, {details: {loginDate: "2026-10-11"}}]) {
      await assert.rejects(() => api.saveStudentReward(reward(changes)), error => error.code === "already-exists");
    }
    assert.equal(writes.length, 3);
    assert.deepEqual([...documents.entries()], before);
  });

  test(layer + ": concurrent unique awards retry and retain every coin and history record", async () => {
    await Promise.all(Array.from({length: 15}, (_, index) => api.saveStudentReward(reward({
      awardId: "award-" + index, categoryId: index % 2 ? api.RewardCategory.DAILY_LOGIN : api.RewardCategory.BONUS_MISSION_COMPLETION,
      coins: index + 1,
    }))));
    assert.equal(await api.getStudentRewardTotal(studentScope), 120);
    assert.equal(await api.getStudentRewardCategoryTotal(scope), 56);
    const bonusScope = {...studentScope, categoryId: api.RewardCategory.BONUS_MISSION_COMPLETION};
    assert.equal(await api.getStudentRewardCategoryTotal(bonusScope), 64);
    assert.equal((await api.listStudentRewardHistory(scope)).entries.length, 7);
    assert.equal((await api.listStudentRewardHistory(bonusScope)).entries.length, 8);
    assert.equal(writes.length, 45);
    assert.ok(transactionAttempts > 15, "Concurrent writes must exercise optimistic retry paths.");
  });

  test(layer + ": concurrent duplicate awards produce one award and one increment", async () => {
    const results = await Promise.all(Array.from({length: 8}, () => api.saveStudentReward(reward({coins: 25}))));
    assert.equal(results.filter(result => !result.alreadyAwarded).length, 1);
    assert.equal(writes.length, 3);
    assert.equal(await api.getStudentRewardTotal(studentScope), 25);
    assert.equal((await api.listStudentRewardHistory(scope)).entries.length, 1);
  });

  test(layer + ": concurrent conflicting duplicates produce one success and one conflict", async () => {
    const results = await Promise.allSettled([
      api.saveStudentReward(reward({coins: 25})), api.saveStudentReward(reward({coins: 20})),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const failure = results.find(result => result.status === "rejected");
    assert.equal(failure.reason.code, "already-exists");
    assert.equal(writes.length, 3);
    const history = (await api.listStudentRewardHistory(scope)).entries;
    assert.equal(await api.getStudentRewardTotal(studentScope), history[0].coins);
  });

  test(layer + ": zero-coin awards are retained and safe integer boundary totals are enforced", async () => {
    const zero = await api.saveStudentReward(reward({coins: 0}));
    assert.equal(zero.totalCoins, 0);
    assert.equal((await api.listStudentRewardHistory(scope)).entries.length, 1);
    const maximum = await api.saveStudentReward(reward({awardId: "maximum", coins: Number.MAX_SAFE_INTEGER}));
    assert.equal(maximum.totalCoins, Number.MAX_SAFE_INTEGER);
    const count = writes.length;
    await assert.rejects(() => api.saveStudentReward(reward({awardId: "overflow", coins: 1})), /whole number/);
    await assert.rejects(() => api.saveStudentReward(reward({awardId: "other-category-overflow", categoryId: api.RewardCategory.ASSESSMENT_LEVEL, coins: 1})), /whole number/);
    assert.equal(writes.length, count);
    assert.equal(documents.has(historyPath + "/overflow"), false);
  });

  test(layer + ": history pages are newest first and retain nanosecond precision through snapshot cursors", async () => {
    // Each timestamp becomes the same JavaScript Date; the snapshot cursor must
    // still distinguish their original Firestore nanoseconds.
    seedAward("z-earliest", {earnedAt: timestamp(baseSeconds, 100)});
    seedAward("a-second", {earnedAt: timestamp(baseSeconds, 200)});
    seedAward("m-latest", {earnedAt: timestamp(baseSeconds, 300)});
    seedAward("other-student", {studentId: "student-2", earnedAt: timestamp(baseSeconds + 1)});
    seedAward("other-category", {categoryId: api.RewardCategory.LOGIN_STREAK, earnedAt: timestamp(baseSeconds + 1)});
    const first = await api.listStudentRewardHistory({...scope, limit: 1});
    assert.equal(first.entries[0].awardId, "m-latest");
    assert.deepEqual(first.nextCursor, {...scope, awardId: "m-latest"});
    const second = await api.listStudentRewardHistory({...scope, limit: 1, cursor: first.nextCursor});
    assert.equal(second.entries[0].awardId, "a-second");
    const third = await api.listStudentRewardHistory({...scope, limit: 1, cursor: second.nextCursor});
    assert.equal(third.entries[0].awardId, "z-earliest");
    assert.equal(third.nextCursor, null);
    assert.equal(queries[1].cursor.data().earnedAt.nanoseconds, 300);
    assert.ok(queries.every(query => query.path === historyPath && query.size === 2));
  });

  test(layer + ": tied timestamps have deterministic document ID ordering without duplicate pages", async () => {
    for (const id of ["a", "c", "b", "d"]) seedAward(id);
    const first = await api.listStudentRewardHistory({...scope, limit: 2});
    const second = await api.listStudentRewardHistory({...scope, limit: 2, cursor: first.nextCursor});
    assert.deepEqual(first.entries.map(entry => entry.awardId), ["d", "c"]);
    assert.deepEqual(second.entries.map(entry => entry.awardId), ["b", "a"]);
    assert.equal(second.nextCursor, null);
    const all = await api.listStudentRewardHistory(scope);
    assert.deepEqual(all.entries.map(entry => entry.awardId), ["d", "c", "b", "a"]);
    assert.equal(all.nextCursor, null);
    assert.equal(queries.at(-1).size, 26);
  });

  test(layer + ": malformed scopes, reserved student IDs and categories never touch storage", async () => {
    for (const studentId of [undefined, null, 1, "", " ", "config", " config ", "nested/id", ".", "..", "__reserved__", "a".repeat(1501)]) {
      await assert.rejects(() => api.saveStudentReward(reward({studentId})));
      await assert.rejects(() => api.getStudentRewardTotal({studentId}));
      await assert.rejects(() => api.getStudentRewardCategoryTotal({...scope, studentId}));
      await assert.rejects(() => api.listStudentRewardHistory({...scope, studentId}));
    }
    for (const categoryId of [undefined, null, "", "DailyLogin", "unknown", "dailyLogin/other"]) {
      await assert.rejects(() => api.saveStudentReward(reward({categoryId})));
      await assert.rejects(() => api.getStudentRewardCategoryTotal({...scope, categoryId}));
      await assert.rejects(() => api.listStudentRewardHistory({...scope, categoryId}));
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });

  test(layer + ": invalid coin amounts, award IDs and sources are rejected before persistence", async () => {
    for (const coins of [undefined, null, -1, 1.5, "25", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true]) {
      await assert.rejects(() => api.saveStudentReward(reward({coins})), /whole number/);
    }
    for (const awardId of [undefined, null, "", " ", "nested/id", ".", "..", "__reserved__"]) {
      await assert.rejects(() => api.saveStudentReward(reward({awardId})), /document ID/);
    }
    for (const sourceId of [undefined, null, "", " ", 123]) {
      await assert.rejects(() => api.saveStudentReward(reward({sourceId})), /reference/);
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(writes, []);
  });

  test(layer + ": details are validated and cloned before awaiting authorization or storage", async () => {
    const cyclic = {}; cyclic.self = cyclic;
    for (const details of [undefined, null, [], new Date(), cyclic, {bad: undefined}, {bad: Infinity}, {bad: 1n}, {bad: () => {}}, {bad: [[1]]}, {bad: new Array(2)}, {__bad__: 1}]) {
      await assert.rejects(() => api.saveStudentReward(reward({details})));
    }
    const input = reward({details: {loginDate: "2026-10-10", nested: {amount: 2}, flags: [true, null, {note: "saved"}]}});
    const pending = api.saveStudentReward(input);
    input.details.nested.amount = 999;
    input.details.flags[2].note = "changed";
    const saved = await pending;
    assert.equal(saved.award.details.nested.amount, 2);
    assert.equal(saved.award.details.flags[2].note, "saved");
    assert.ok(Object.isFrozen(saved.award.details.nested));
    assert.ok(Object.isFrozen(saved.award.details.flags));
  });

  test(layer + ": malformed pagination and cross-scope cursors are rejected", async () => {
    for (const limit of [0, -1, 101, 2.5, "5", null, Infinity]) {
      await assert.rejects(() => api.listStudentRewardHistory({...scope, limit}), /limit/);
    }
    for (const cursor of ["award", {}, {...scope, studentId: "student-2", awardId: "a"}, {...scope, categoryId: api.RewardCategory.LOGIN_STREAK, awardId: "a"}, {...scope, awardId: "nested/id"}]) {
      await assert.rejects(() => api.listStudentRewardHistory({...scope, cursor}));
    }
    await assert.rejects(() => api.listStudentRewardHistory({...scope, cursor: {...scope, awardId: "missing"}}), error => error.code === "not-found");
    assert.deepEqual(writes, []);
  });

  test(layer + ": read failures and failed transaction commits propagate without partial awards", async () => {
    readFailure = new Error("Read unavailable");
    await assert.rejects(() => api.getStudentRewardTotal(studentScope), /Read unavailable/);
    await assert.rejects(() => api.getStudentRewardCategoryTotal(scope), /Read unavailable/);
    await assert.rejects(() => api.listStudentRewardHistory(scope), /Read unavailable/);
    await assert.rejects(() => api.listRecentStudentRewardActivities({...studentScope, limit: 5}), /Read unavailable/);
    await assert.rejects(() => api.saveStudentReward(reward()), /Read unavailable/);
    readFailure = null;
    writeFailure = new Error("Commit unavailable");
    await assert.rejects(() => api.saveStudentReward(reward()), /Commit unavailable/);
    assert.deepEqual(writes, []);
    assert.equal(documents.has(studentPath), false);
    assert.equal(documents.has(categoryPath), false);
    assert.equal(documents.has(historyPath + "/" + reward().awardId), false);
  });

  test(layer + ": retrying after a post-commit read failure does not award twice", async () => {
    directReadFailure = historyPath + "/" + reward().awardId;
    await assert.rejects(() => api.saveStudentReward(reward()), /Post-commit read failed/);
    assert.equal(writes.length, 3);
    directReadFailure = null;
    const retried = await api.saveStudentReward(reward());
    assert.equal(retried.alreadyAwarded, true);
    assert.equal(retried.totalCoins, 1);
    assert.equal(writes.length, 3);
  });

  test(layer + ": corrupt stored totals and history are reported without overwriting them", async () => {
    documents.set(studentPath, {totalCoins: -1});
    await assert.rejects(() => api.getStudentRewardTotal(studentScope), /whole number/);
    await assert.rejects(() => api.saveStudentReward(reward()), /whole number/);
    documents.set(studentPath, {totalCoins: 1});
    documents.set(categoryPath, {totalCoins: 2});
    await assert.rejects(() => api.saveStudentReward(reward()), /inconsistent/);
    documents.set(categoryPath, {totalCoins: 1});
    seedAward(reward().awardId, {coins: 1, sourceId: reward().sourceId, details: reward().details, earnedAt: null});
    await assert.rejects(() => api.saveStudentReward(reward()), /timestamp/);
    await assert.rejects(() => api.listStudentRewardHistory(scope), /timestamp/);
    documents.delete(studentPath);
    await assert.rejects(() => api.saveStudentReward(reward()), /inconsistent|missing/);
    assert.deepEqual(writes, []);
  });
}
test("web student reward APIs require authentication", async () => {
  auth.currentUser = null;
  await assert.rejects(() => web.saveStudentReward(reward()), /signed in/);
  await assert.rejects(() => web.getStudentRewardTotal(studentScope), /signed in/);
  await assert.rejects(() => web.getStudentRewardCategoryTotal(scope), /signed in/);
  await assert.rejects(() => web.listStudentRewardHistory(scope), /signed in/);
  await assert.rejects(() => web.listRecentStudentRewardActivities({...studentScope, limit: 5}), /signed in/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});
test("signed-in students can read totals/history but cannot submit arbitrary coin awards", async () => {
  auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};
  assert.equal(await web.getStudentRewardTotal(studentScope), 0);
  assert.equal(await web.getStudentRewardCategoryTotal(scope), 0);
  assert.deepEqual(await web.listStudentRewardHistory(scope), {entries: [], nextCursor: null});
  assert.deepEqual(await web.listRecentStudentRewardActivities({...studentScope, limit: 5}), []);
  reads.length = 0;
  await assert.rejects(() => web.saveStudentReward(reward()), /administrator/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});
test("unverified administrators and account changes cannot write coin awards", async () => {
  auth.currentUser = {...admin, emailVerified: false};
  await assert.rejects(() => web.saveStudentReward(reward()));
  auth.currentUser = {...admin};
  onAdminCheck = () => { auth.currentUser = {...admin, uid: "changed"}; };
  await assert.rejects(() => web.saveStudentReward(reward()), /account changed/);
  auth.currentUser = {...admin};
  onAdminCheck = () => { auth.currentUser = null; };
  await assert.rejects(() => web.saveStudentReward(reward()), /signed in/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

const loginDate = "2026-10-10";
function loginInput(currentStreakDays = 1, changes = {}) {
  const input = {...studentScope, loginDate, loggedInAt: timestamp(), currentStreakDays, ...changes};
  documents.set("studentLogins/" + input.studentId + "/history/" + input.loginDate, {
    loggedInAt: input.loggedInAt,
    ...(input.currentStreakDays === undefined ? {} : {currentStreakDays: input.currentStreakDays}),
  });
  return input;
}
async function awardStudentLogin(input, dependencies = {}) {
  if (Object.keys(dependencies).length === 0) return backend.awardStudentLogin(input);
  const repository = new FirestoreStudentRewardRepository();
  return new AwardStudentLogin({
    studentRewardRepository: {
      getById: dependencies.getAward ?? (scope => repository.getById(scope)),
      save: dependencies.saveReward ?? backend.saveStudentReward,
    },
    getStudentLoginRecord: loginFeature.getStudentLoginRecord,
    listStudentLoginHistory: dependencies.listHistory ?? loginFeature.listStudentLoginHistory,
    getRewardConfig: dependencies.getConfig ?? backend.getRewardConfig,
    now: dependencies.now,
  }).execute(input);
}
function loginConfig(changes = {}) {
  return {...backend.DEFAULT_REWARD_CONFIG, ...changes};
}
function savedLoginConfig(changes = {}) {
  documents.set("rewards/config", {...loginConfig(changes), updatedAt: timestamp(), updatedBy: admin.uid});
}

test("login awards use unsaved defaults and are available through web reward reads", async () => {
  documents.delete("rewards/config");
  const result = await awardStudentLogin(loginInput());
  assert.equal(result.dailyReward.award.coins, 1);
  assert.equal(result.streakReward, null);
  assert.equal(await web.getStudentRewardTotal(studentScope), 1);
  assert.equal((await web.listStudentRewardHistory(scope)).entries[0].sourceId, loginDate);
  assert.equal(documents.has("rewards/config"), false);
  assert.deepEqual(callables, []);
});

for (const [days, coins] of [[3, 2], [7, 5], [14, 10], [30, 25]]) {
  test("login day " + days + " awards the configured streak milestone once", async () => {
    savedLoginConfig();
    const input = loginInput(days);
    const first = await awardStudentLogin(input);
    assert.equal(first.dailyReward.award.coins, 1);
    assert.equal(first.streakReward.award.coins, coins);
    assert.equal(first.streakReward.award.awardId, "login-streak-" + days + "-" + loginDate);
    const before = [...documents.entries()];
    const beforeWrites = writes.length;
    const retry = await awardStudentLogin(input);
    assert.equal(retry.dailyReward.alreadyAwarded, true);
    assert.equal(retry.streakReward.alreadyAwarded, true);
    assert.equal(await backend.getStudentRewardTotal(studentScope), coins + 1);
    assert.deepEqual([...documents.entries()], before);
    assert.equal(writes.length, beforeWrites);
  });
}

test("days between milestones and streaks longer than thirty days receive only daily coins", async () => {
  savedLoginConfig();
  for (const days of [1, 2, 4, 6, 8, 13, 15, 29, 31, 60]) {
    const result = await awardStudentLogin(loginInput(days, {studentId: "student-" + days}));
    assert.equal(result.streakReward, null);
    assert.equal(result.dailyReward.totalCoins, 1);
  }
});

test("custom and zero amounts come from persisted reward config", async () => {
  savedLoginConfig({dailyLoginCoins: 8, loginStreakCoins: {"3": 12, "7": 5, "14": 10, "30": 25}});
  const custom = await awardStudentLogin(loginInput(3));
  assert.equal(custom.dailyReward.award.coins, 8);
  assert.equal(custom.streakReward.award.coins, 12);
  savedLoginConfig({dailyLoginCoins: 0, loginStreakCoins: {"3": 0, "7": 0, "14": 0, "30": 0}});
  const zero = await awardStudentLogin(loginInput(3, {studentId: "student-zero"}));
  assert.equal(zero.dailyReward.award.coins, 0);
  assert.equal(zero.streakReward.award.coins, 0);
  assert.equal(zero.streakReward.totalCoins, 0);
  assert.equal((await awardStudentLogin(loginInput(3, {studentId: "student-zero"}))).streakReward.alreadyAwarded, true);
});

test("concurrent login trigger deliveries create only one daily award and one bonus", async () => {
  savedLoginConfig();
  const results = await Promise.all(Array.from({length: 8}, () => awardStudentLogin(loginInput(7))));
  assert.equal(results.filter(result => !result.dailyReward.alreadyAwarded).length, 1);
  assert.equal(results.filter(result => !result.streakReward.alreadyAwarded).length, 1);
  assert.equal(await backend.getStudentRewardTotal(studentScope), 6);
  assert.equal(writes.length, 6);
});

test("concurrent deliveries with different config follow the first committed reward plan", async () => {
  const configs = [loginConfig(), loginConfig({dailyLoginCoins: 20, loginStreakCoins: {"3": 40, "7": 5, "14": 10, "30": 25}})];
  const results = await Promise.all(configs.map(config => awardStudentLogin(loginInput(3), {getConfig: async () => config})));
  const daily = results[0].dailyReward.award;
  const bonus = results[0].streakReward.award;
  assert.equal(results[1].dailyReward.award.coins, daily.coins);
  assert.equal(results[1].streakReward.award.coins, bonus.coins);
  assert.equal(await backend.getStudentRewardTotal(studentScope), daily.coins + bonus.coins);
  assert.equal(writes.length, 6);
});

test("retry after a bonus failure finishes the original plan even if config changes", async () => {
  savedLoginConfig();
  await assert.rejects(() => awardStudentLogin(loginInput(3), {
    saveReward: async input => {
      if (input.categoryId === backend.RewardCategory.LOGIN_STREAK) throw new Error("Temporary bonus failure");
      return backend.saveStudentReward(input);
    },
  }), /Temporary bonus failure/);
  assert.equal(await backend.getStudentRewardTotal(studentScope), 1);
  savedLoginConfig({dailyLoginCoins: 100, loginStreakCoins: {"3": 200, "7": 5, "14": 10, "30": 25}});
  const retry = await awardStudentLogin(loginInput(3), {getConfig: async () => {throw new Error("Config must not be reread");}});
  assert.equal(retry.dailyReward.alreadyAwarded, true);
  assert.equal(retry.streakReward.award.coins, 2);
  assert.equal(await backend.getStudentRewardTotal(studentScope), 3);
  assert.equal(writes.length, 6);
});

test("retry after a committed daily award whose final read failed does not award again", async () => {
  savedLoginConfig();
  directReadFailure = historyPath + "/daily-login-" + loginDate;
  await assert.rejects(() => awardStudentLogin(loginInput(), {getAward: async () => null}), /Post-commit read failed/);
  directReadFailure = null;
  savedLoginConfig({dailyLoginCoins: 100});
  const retry = await awardStudentLogin(loginInput());
  assert.equal(retry.dailyReward.alreadyAwarded, true);
  assert.equal(retry.dailyReward.totalCoins, 1);
  assert.equal(writes.length, 3);
});

test("snapshotted streaks handle delayed events without querying newer login history", async () => {
  savedLoginConfig();
  const result = await awardStudentLogin(loginInput(3, {loginDate: "2026-01-01"}), {
    listHistory: async () => {throw new Error("History must not be queried");},
  });
  assert.equal(result.streakReward.award.coins, 2);
  assert.equal(result.streakReward.award.sourceId, "2026-01-01");
});

test("retry after a committed bonus whose final read failed preserves both awards", async () => {
  savedLoginConfig();
  directReadFailure = studentPath + "/categories/loginStreak/history/login-streak-3-" + loginDate;
  await assert.rejects(() => awardStudentLogin(loginInput(3)), /Post-commit read failed/);
  directReadFailure = null;
  assert.equal(await backend.getStudentRewardTotal(studentScope), 3);
  savedLoginConfig({dailyLoginCoins: 100, loginStreakCoins: {"3": 200, "7": 5, "14": 10, "30": 25}});
  const retry = await awardStudentLogin(loginInput(3));
  assert.equal(retry.dailyReward.alreadyAwarded, true);
  assert.equal(retry.streakReward.alreadyAwarded, true);
  assert.equal(retry.streakReward.totalCoins, 3);
  assert.equal(writes.length, 6);
});

test("a new streak can earn the same milestone again on a different date", async () => {
  savedLoginConfig();
  await awardStudentLogin(loginInput(3));
  await awardStudentLogin(loginInput(3, {loginDate: "2026-10-20"}));
  assert.equal(await backend.getStudentRewardTotal(studentScope), 6);
  const history = await backend.listStudentRewardHistory({...studentScope, categoryId: backend.RewardCategory.LOGIN_STREAK});
  assert.equal(history.entries.length, 2);
});

function legacyHistory(loginDates) {
  return async input => {
    assert.deepEqual(input, {...studentScope, limit: 45});
    return {entries: loginDates.map(date => ({...studentScope, loginDate: date, loggedInAt: timestamp()})), nextCursor: null};
  };
}
test("older timestamp-only login events calculate the streak as of that date", async () => {
  savedLoginConfig();
  const result = await awardStudentLogin(loginInput(undefined, {currentStreakDays: undefined, loginDate: "2026-10-07"}), {
    listHistory: legacyHistory(["2026-10-10", "2026-10-09", "2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05"]),
    now: () => new Date("2026-10-10T12:00:00Z"),
  });
  assert.equal(result.streakReward.award.coins, 2);
  assert.equal(result.dailyReward.award.details.currentStreakDays, 3);
});

test("legacy history gaps restart streaks and more than thirty days is not another milestone", async () => {
  savedLoginConfig();
  const gap = await awardStudentLogin(loginInput(undefined, {currentStreakDays: undefined}), {
    listHistory: legacyHistory([loginDate, "2026-10-08"]), now: () => new Date("2026-10-10T12:00:00Z"),
  });
  assert.equal(gap.streakReward, null);
  const long = await awardStudentLogin(loginInput(undefined, {currentStreakDays: undefined, loginDate: "2026-10-09"}), {
    listHistory: legacyHistory(Array.from({length: 32}, (_, index) => shiftLoginDate(loginDate, -index))),
    now: () => new Date("2026-10-10T12:00:00Z"),
  });
  assert.equal(long.streakReward, null);
  assert.equal(long.dailyReward.award.details.currentStreakDays, 31);
});

test("invalid snapshots and incomplete legacy history fail before awarding coins", async () => {
  savedLoginConfig();
  for (const input of [loginInput(0), loginInput(1.5), loginInput(1, {studentId: "config"}), loginInput(1, {loginDate: "2026-02-30"})]) {
    await assert.rejects(() => awardStudentLogin(input));
  }
  await assert.rejects(() => awardStudentLogin(loginInput(undefined, {currentStreakDays: undefined, loginDate: "2026-08-27"}), {
    listHistory: legacyHistory(["2026-08-27"]), now: () => new Date("2026-10-10T12:00:00Z"),
  }), /cannot be determined/);
  assert.equal(writes.length, 0);
});

test("conflicting daily reward source or streak snapshot is not silently accepted", async () => {
  savedLoginConfig();
  await awardStudentLogin(loginInput(3));
  await assert.rejects(() => awardStudentLogin(loginInput(7)), /conflicting streak/);
  const entry = documents.get(historyPath + "/daily-login-" + loginDate);
  documents.set(historyPath + "/daily-login-" + loginDate, {...entry, sourceId: "another-date"});
  await assert.rejects(() => awardStudentLogin(loginInput(3)), /conflicting source/);
  assert.equal(writes.length, 6);
});

test("internal reward lookup returns one scoped immutable award and does not write", async () => {
  const repository = new FirestoreStudentRewardRepository();
  assert.equal(await repository.getById({...scope, awardId: "missing"}), null);
  const saved = await backend.saveStudentReward(reward());
  const before = writes.length;
  assert.deepEqual(await repository.getById({...scope, awardId: saved.award.awardId}), saved.award);
  assert.equal(await repository.getById({...scope, studentId: "student-2", awardId: saved.award.awardId}), null);
  await assert.rejects(() => repository.getById({...scope, awardId: "bad/id"}));
  assert.equal(writes.length, before);
});

function seedDailyMission({studentId = studentScope.studentId, practiceId = "daily-1",
  missionDate = "2026-10-01", syllabusId = "math", topicId = "fractions", completed = true} = {}) {
  const student = "studentDailyMissions/" + studentId;
  documents.set(student + "/acceptedDailyMissionPractices/" + practiceId, {missionDate, syllabusId, topicId});
  documents.set(student + "/days/" + missionDate, {});
  documents.set(student + "/days/" + missionDate + "/syllabuses/" + syllabusId, {coreMission: {practiceId, topicId}});
  if (completed) documents.set("studentPractices/" + studentId + "/completedPractices/" + practiceId, {score: 0});
  return {studentId, practiceId};
}

for (const stage of ["assessment", "generation"]) {
  test("completion trigger: a retry after " + stage + " failure preserves one configured mission award", async () => {
    savedLoginConfig({dailyMissionCompletionCoins: 40});
    const input = {...seedDailyMission(), eventId: "event-daily-completed"};
    const processingPath = "studentPractices/student-1/completionProcessing/daily-1";
    const error = new Error(stage + " unavailable");
    let fail = true;
    const operations = {
      // Use the trigger's real Reward API and processing repository.
      assessPractice: async () => {
        assert.equal(await backend.getStudentRewardTotal(studentScope), 40);
        if (fail && stage === "assessment") throw error;
        return {assessed: true, isFrameworkCompleted: false, syllabusId: "math", topicId: "fractions"};
      },
      calculateReadiness: async () => null,
      calculateTopicReliability: async () => ({score: 10, completedPracticeCount: 1}),
      saveTopicReliability: async value => value,
      calculateSubjectReliability: async () => 10,
      saveSubjectReliability: async value => value,
      generatePractice: async () => {
        if (fail && stage === "generation") throw error;
        return {practice: {id: "next-practice"}};
      },
    };

    await assert.rejects(() => assessCompletedStudentPractice(input, operations), actual => actual === error);
    assert.equal(documents.get(processingPath).status, "failed");
    assert.equal(await backend.getStudentRewardTotal(studentScope), 40);
    savedLoginConfig({dailyMissionCompletionCoins: 100});
    fail = false;
    const retry = await assessCompletedStudentPractice(input, operations);
    assert.equal(retry.generation.practice.id, "next-practice");
    assert.equal(documents.get(processingPath).status, "completed");
    assert.equal(await backend.getStudentRewardTotal(studentScope), 40);
    assert.equal(writes.filter(write => write.path.startsWith("rewards/student-1/") || write.path === studentPath).length, 3);
    const history = await backend.listStudentRewardHistory({
      ...studentScope, categoryId: backend.RewardCategory.DAILY_MISSION_COMPLETION,
    });
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0].coins, 40);
    assert.equal(history.entries[0].sourceId, input.practiceId);

    const before = writes.length;
    const duplicate = await assessCompletedStudentPractice(input, {
      awardDailyMission: async () => { throw new Error("must not reward a fully processed event"); },
      assessPractice: async () => { throw new Error("must not reassess a fully processed event"); },
    });
    assert.equal(duplicate.alreadyProcessed, true);
    assert.equal(writes.length, before);
  });
}

test("completion trigger: non-daily practices continue without daily mission coins", async () => {
  documents.set("studentPractices/student-1/completedPractices/bonus-1", {});
  const result = await assessCompletedStudentPractice({
    eventId: "event-bonus-completed", studentId: "student-1", practiceId: "bonus-1",
  }, {
    assessPractice: async () => ({assessed: false, reason: "assessment-not-supported"}),
    generatePractice: async () => { throw new Error("must not generate after skipped assessment"); },
  });
  assert.equal(result.generation, null);
  assert.equal(await backend.getStudentRewardTotal(studentScope), 0);
  assert.equal(documents.get("studentPractices/student-1/completionProcessing/bonus-1").status, "completed");
  assert.equal(writes.filter(write => write.path.startsWith("rewards/")).length, 0);
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": the mission reward API uses the configured amount and ignores caller coin/context fields", async () => {
    savedLoginConfig({dailyMissionCompletionCoins: 40});
    const input = seedDailyMission();
    const result = await api.awardDailyMissionCompletion({...input, coins: 999, missionDate: "2099-01-01", syllabusId: "spoofed"});
    assert.equal(result.award.coins, 40);
    assert.equal(result.award.categoryId, api.RewardCategory.DAILY_MISSION_COMPLETION);
    assert.equal(result.award.sourceId, input.practiceId);
    assert.deepEqual(result.award.details, {missionDate: "2026-10-01", syllabusId: "math", topicId: "fractions", practiceId: "daily-1"});
    assert.equal(result.totalCoins, 40);
    assert.equal(result.categoryTotalCoins, 40);
    assert.equal(writes.length, 3);
  });

  test(layer + ": unsaved config awards twenty-five coins without saving defaults", async () => {
    documents.delete("rewards/config");
    const result = await api.awardDailyMissionCompletion(seedDailyMission());
    assert.equal(result.award.coins, 25);
    assert.equal(documents.has("rewards/config"), false);
  });

  test(layer + ": only accepted and completed Daily Missions qualify", async () => {
    savedLoginConfig();
    documents.set("studentPractices/student-1/completedPractices/bonus-1", {});
    assert.equal(await api.awardDailyMissionCompletion({...studentScope, practiceId: "bonus-1"}), null);
    const input = seedDailyMission({completed: false});
    await assert.rejects(() => api.awardDailyMissionCompletion(input), error => error.code === "failed-precondition");
    assert.equal(writes.length, 0);
  });

  test(layer + ": repeated awards keep the original amount after config changes", async () => {
    savedLoginConfig();
    const input = seedDailyMission();
    const first = await api.awardDailyMissionCompletion(input);
    savedLoginConfig({dailyMissionCompletionCoins: 100});
    const retry = await api.awardDailyMissionCompletion(input);
    assert.equal(retry.alreadyAwarded, true);
    assert.deepEqual(retry.award, first.award);
    assert.equal(retry.totalCoins, 25);
    assert.equal(writes.length, 3);
  });

  test(layer + ": a legacy Daily Mission without a lookup can still receive its completion reward", async () => {
    savedLoginConfig();
    const input = seedDailyMission();
    documents.delete("studentDailyMissions/" + input.studentId + "/acceptedDailyMissionPractices/" + input.practiceId);
    const result = await api.awardDailyMissionCompletion(input);
    assert.equal(result.award.coins, 25);
    assert.equal(result.award.details.missionDate, "2026-10-01");
  });

  test(layer + ": concurrent calls award one Daily Mission exactly once", async () => {
    savedLoginConfig();
    const input = seedDailyMission();
    const results = await Promise.all(Array.from({length: 8}, () => api.awardDailyMissionCompletion(input)));
    assert.equal(results.filter(result => !result.alreadyAwarded).length, 1);
    assert.equal(await api.getStudentRewardTotal(studentScope), 25);
    assert.equal(writes.length, 3);
  });

  test(layer + ": concurrent config changes keep the first committed daily mission amount", async () => {
    const input = seedDailyMission();
    let configCalls = 0;
    const UseCase = layer === "backend" ? AwardDailyMissionCompletion : WebAwardDailyMissionCompletion;
    const Repository = layer === "backend" ? FirestoreStudentRewardRepository : WebStudentRewardRepository;
    const useCase = new UseCase({
      studentRewardRepository: new Repository(),
      getAcceptedDailyMissionForPractice: async () => ({missionDate: "2026-10-01", syllabusId: "math", topicId: "fractions", practiceId: input.practiceId}),
      listCompletedPracticeIds: async scope => {assert.deepEqual(scope, studentScope); return [input.practiceId];},
      getRewardConfig: async () => ({dailyMissionCompletionCoins: ++configCalls % 2 ? 25 : 100}),
    });
    const results = await Promise.all(Array.from({length: 8}, () => useCase.execute(input)));
    const coins = results[0].award.coins;
    assert.equal(results.filter(result => !result.alreadyAwarded).length, 1);
    assert.ok(results.every(result => result.award.coins === coins));
    assert.equal(await api.getStudentRewardTotal(studentScope), coins);
    assert.equal(writes.length, 3);
  });

  test(layer + ": a conflicting practice in the same subject/day cannot claim a second award", async () => {
    savedLoginConfig();
    await api.awardDailyMissionCompletion(seedDailyMission());
    const conflicting = seedDailyMission({practiceId: "daily-conflict"});
    await assert.rejects(() => api.awardDailyMissionCompletion(conflicting), error => error.code === "already-exists");
    assert.equal(await api.getStudentRewardTotal(studentScope), 25);
    assert.equal(writes.length, 3);
  });

  test(layer + ": each subject and mission day has its own award", async () => {
    savedLoginConfig();
    await api.awardDailyMissionCompletion(seedDailyMission());
    await api.awardDailyMissionCompletion(seedDailyMission({practiceId: "science-1", syllabusId: "science"}));
    await api.awardDailyMissionCompletion(seedDailyMission({practiceId: "daily-2", missionDate: "2026-10-02"}));
    assert.equal(await api.getStudentRewardTotal(studentScope), 75);
    const history = await api.listStudentRewardHistory({...studentScope, categoryId: api.RewardCategory.DAILY_MISSION_COMPLETION});
    assert.equal(history.entries.length, 3);
  });

  test(layer + ": zero coin configuration is a persisted award and invalid amounts do not write", async () => {
    savedLoginConfig({dailyMissionCompletionCoins: 0});
    const result = await api.awardDailyMissionCompletion(seedDailyMission());
    assert.equal(result.award.coins, 0);
    assert.equal(result.totalCoins, 0);
    const before = writes.length;
    savedLoginConfig({dailyMissionCompletionCoins: -1});
    await assert.rejects(() => api.awardDailyMissionCompletion(seedDailyMission({practiceId: "next", missionDate: "2026-10-02"})));
    assert.equal(writes.length, before);
  });

  test(layer + ": recovery after a committed award whose final read failed preserves its original amount", async () => {
    savedLoginConfig();
    const input = seedDailyMission();
    const originalConfig = documents.get("rewards/config");
    const originalRead = reference;
    // Fail the saved history read after its transaction has committed.
    let failed = false;
    const repo = new (layer === "backend" ? FirestoreStudentRewardRepository : WebStudentRewardRepository)({
      readDocument: async (path, id) => documents.get(path + "/" + id) ?? null,
      getDocumentRef: (path, id) => {
        const ref = originalRead(path + "/" + id);
        if (path.endsWith("/categories/dailyMissionCompletion/history")) {
          ref.get = async () => {
            if (!failed) {failed = true; throw new Error("Post-commit failure");}
            return snapshot(ref.path);
          };
        }
        return ref;
      },
      getFirestoreDb: () => db,
    });
    const UseCase = layer === "backend" ? AwardDailyMissionCompletion : WebAwardDailyMissionCompletion;
    const useCase = new UseCase({
      studentRewardRepository: repo, getAcceptedDailyMissionForPractice: async () => ({missionDate: "2026-10-01", syllabusId: "math", topicId: "fractions", practiceId: input.practiceId}),
      listCompletedPracticeIds: async () => [input.practiceId], getRewardConfig: async () => documents.get("rewards/config"),
    });
    await assert.rejects(() => useCase.execute(input), /Post-commit failure/);
    documents.set("rewards/config", {...originalConfig, dailyMissionCompletionCoins: 100});
    const retry = await useCase.execute(input);
    assert.equal(retry.alreadyAwarded, true);
    assert.equal(retry.totalCoins, 25);
    assert.equal(writes.length, 3);
  });
}

function seedAdditionalMission({studentId = studentScope.studentId, practiceId = "additional-1",
  missionDate = "2026-10-01", syllabusId = "math", topicId = "fractions", completed = true} = {}) {
  const student = "studentDailyMissions/" + studentId;
  documents.set(student + "/acceptedAdditionalMissionPractices/" + practiceId, {missionDate, syllabusId, topicId});
  documents.set(student + "/days/" + missionDate, {});
  const syllabus = student + "/days/" + missionDate + "/syllabuses/" + syllabusId;
  documents.set(syllabus, documents.get(syllabus) ?? {});
  documents.set(syllabus + "/additionalTopics/" + topicId, {});
  documents.set(syllabus + "/additionalTopics/" + topicId + "/practices/" + practiceId, {});
  if (completed) documents.set("studentPractices/" + studentId + "/completedPractices/" + practiceId, {score: 0});
  return {studentId, practiceId};
}

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": the mission reward API uses the configured amount and ignores caller coin/context fields", async () => {
    savedLoginConfig({bonusMissionCompletionCoins: 40});
    const input = seedAdditionalMission();
    const result = await api.awardAdditionalMissionCompletion({...input, coins: 999, missionDate: "2099-01-01", syllabusId: "spoofed"});
    assert.equal(result.award.coins, 40);
    assert.equal(result.award.categoryId, api.RewardCategory.BONUS_MISSION_COMPLETION);
    assert.equal(result.award.sourceId, input.practiceId);
    assert.deepEqual(result.award.details, {missionDate: "2026-10-01", syllabusId: "math", topicId: "fractions", practiceId: "additional-1"});
    assert.equal(result.totalCoins, 40);
    assert.equal(result.categoryTotalCoins, 40);
    assert.equal(writes.length, 3);
  });

  test(layer + ": unsaved config awards twenty coins without saving defaults", async () => {
    documents.delete("rewards/config");
    const result = await api.awardAdditionalMissionCompletion(seedAdditionalMission());
    assert.equal(result.award.coins, 20);
    assert.equal(documents.has("rewards/config"), false);
  });

  test(layer + ": only accepted and completed Additional Missions qualify", async () => {
    savedLoginConfig();
    documents.set("studentPractices/student-1/completedPractices/bonus-1", {});
    assert.equal(await api.awardAdditionalMissionCompletion({...studentScope, practiceId: "bonus-1"}), null);
    const input = seedAdditionalMission({completed: false});
    await assert.rejects(() => api.awardAdditionalMissionCompletion(input), error => error.code === "failed-precondition");
    assert.equal(writes.length, 0);
  });

  test(layer + ": repeated awards keep the original amount after config changes", async () => {
    savedLoginConfig();
    const input = seedAdditionalMission();
    const first = await api.awardAdditionalMissionCompletion(input);
    savedLoginConfig({bonusMissionCompletionCoins: 100});
    const retry = await api.awardAdditionalMissionCompletion(input);
    assert.equal(retry.alreadyAwarded, true);
    assert.deepEqual(retry.award, first.award);
    assert.equal(retry.totalCoins, 20);
    assert.equal(writes.length, 3);
  });

  test(layer + ": a legacy Additional Mission without a lookup can still receive its completion reward", async () => {
    savedLoginConfig();
    const input = seedAdditionalMission();
    documents.delete("studentDailyMissions/" + input.studentId + "/acceptedAdditionalMissionPractices/" + input.practiceId);
    const result = await api.awardAdditionalMissionCompletion(input);
    assert.equal(result.award.coins, 20);
    assert.equal(result.award.details.missionDate, "2026-10-01");
  });

  test(layer + ": concurrent calls award one Additional Mission exactly once", async () => {
    savedLoginConfig();
    const input = seedAdditionalMission();
    const results = await Promise.all(Array.from({length: 8}, () => api.awardAdditionalMissionCompletion(input)));
    assert.equal(results.filter(result => !result.alreadyAwarded).length, 1);
    assert.equal(await api.getStudentRewardTotal(studentScope), 20);
    assert.equal(writes.length, 3);
  });

  test(layer + ": concurrent config changes keep the first committed additional mission amount", async () => {
    const input = seedAdditionalMission();
    let configCalls = 0;
    const UseCase = layer === "backend" ? AwardAdditionalMissionCompletion : WebAwardAdditionalMissionCompletion;
    const Repository = layer === "backend" ? FirestoreStudentRewardRepository : WebStudentRewardRepository;
    const useCase = new UseCase({
      studentRewardRepository: new Repository(),
      getAcceptedAdditionalMissionForPractice: async () => ({missionDate: "2026-10-01", syllabusId: "math", topicId: "fractions", practiceId: input.practiceId}),
      listCompletedPracticeIds: async scope => {assert.deepEqual(scope, studentScope); return [input.practiceId];},
      getRewardConfig: async () => ({bonusMissionCompletionCoins: ++configCalls % 2 ? 20 : 100}),
    });
    const results = await Promise.all(Array.from({length: 8}, () => useCase.execute(input)));
    const coins = results[0].award.coins;
    assert.equal(results.filter(result => !result.alreadyAwarded).length, 1);
    assert.ok(results.every(result => result.award.coins === coins));
    assert.equal(await api.getStudentRewardTotal(studentScope), coins);
    assert.equal(writes.length, 3);
  });

  test(layer + ": a conflicting practice in the same subject/day cannot claim a second award", async () => {
    savedLoginConfig();
    await api.awardAdditionalMissionCompletion(seedAdditionalMission());
    const conflicting = seedAdditionalMission({practiceId: "daily-conflict"});
    await assert.rejects(() => api.awardAdditionalMissionCompletion(conflicting), error => error.code === "already-exists");
    assert.equal(await api.getStudentRewardTotal(studentScope), 20);
    assert.equal(writes.length, 3);
  });

  test(layer + ": each subject and mission day has its own award", async () => {
    savedLoginConfig();
    await api.awardAdditionalMissionCompletion(seedAdditionalMission());
    await api.awardAdditionalMissionCompletion(seedAdditionalMission({practiceId: "science-1", syllabusId: "science"}));
    await api.awardAdditionalMissionCompletion(seedAdditionalMission({practiceId: "daily-2", missionDate: "2026-10-02"}));
    assert.equal(await api.getStudentRewardTotal(studentScope), 60);
    const history = await api.listStudentRewardHistory({...studentScope, categoryId: api.RewardCategory.BONUS_MISSION_COMPLETION});
    assert.equal(history.entries.length, 3);
  });

  test(layer + ": zero coin configuration is a persisted award and invalid amounts do not write", async () => {
    savedLoginConfig({bonusMissionCompletionCoins: 0});
    const result = await api.awardAdditionalMissionCompletion(seedAdditionalMission());
    assert.equal(result.award.coins, 0);
    assert.equal(result.totalCoins, 0);
    const before = writes.length;
    savedLoginConfig({bonusMissionCompletionCoins: -1});
    await assert.rejects(() => api.awardAdditionalMissionCompletion(seedAdditionalMission({practiceId: "next", missionDate: "2026-10-02"})));
    assert.equal(writes.length, before);
  });

  test(layer + ": recovery after a committed award whose final read failed preserves its original amount", async () => {
    savedLoginConfig();
    const input = seedAdditionalMission();
    const originalConfig = documents.get("rewards/config");
    const originalRead = reference;
    // Fail the saved history read after its transaction has committed.
    let failed = false;
    const repo = new (layer === "backend" ? FirestoreStudentRewardRepository : WebStudentRewardRepository)({
      readDocument: async (path, id) => documents.get(path + "/" + id) ?? null,
      getDocumentRef: (path, id) => {
        const ref = originalRead(path + "/" + id);
        if (path.endsWith("/categories/bonusMissionCompletion/history")) {
          ref.get = async () => {
            if (!failed) {failed = true; throw new Error("Post-commit failure");}
            return snapshot(ref.path);
          };
        }
        return ref;
      },
      getFirestoreDb: () => db,
    });
    const UseCase = layer === "backend" ? AwardAdditionalMissionCompletion : WebAwardAdditionalMissionCompletion;
    const useCase = new UseCase({
      studentRewardRepository: repo, getAcceptedAdditionalMissionForPractice: async () => ({missionDate: "2026-10-01", syllabusId: "math", topicId: "fractions", practiceId: input.practiceId}),
      listCompletedPracticeIds: async () => [input.practiceId], getRewardConfig: async () => documents.get("rewards/config"),
    });
    await assert.rejects(() => useCase.execute(input), /Post-commit failure/);
    documents.set("rewards/config", {...originalConfig, bonusMissionCompletionCoins: 100});
    const retry = await useCase.execute(input);
    assert.equal(retry.alreadyAwarded, true);
    assert.equal(retry.totalCoins, 20);
    assert.equal(writes.length, 3);
  });
}

for (const [layer, api, LoginReward, Repository, logins] of [
  ["backend", backend, AwardStudentLogin, FirestoreStudentRewardRepository, loginFeature],
  ["web", web, WebAwardStudentLogin, WebStudentRewardRepository, webLoginFeature],
]) {
  test(layer + ": the login reward API uses the saved streak and ignores caller amounts and snapshots", async () => {
    savedLoginConfig({dailyLoginCoins: 4, loginStreakCoins: {"3": 9, "7": 5, "14": 10, "30": 25}});
    loginInput(3);
    documents.set("studentLogins/student-1", {currentStreakDays: 30});
    const result = await api.awardStudentLogin({
      studentId: " student-1 ", loginDate,
      currentStreakDays: 30, coins: 999, loggedInAt: null,
    });
    assert.equal(result.dailyReward.award.coins, 4);
    assert.equal(result.dailyReward.award.details.currentStreakDays, 3);
    assert.equal(result.streakReward.award.coins, 9);
    assert.equal(result.streakReward.totalCoins, 13);
    assert.equal(writes.length, 6);
    assert.ok(reads.includes("studentLogins/student-1/history/" + loginDate));
    assert.ok(!reads.includes("studentLogins/student-1"));
  });

  test(layer + ": the login reward API uses unsaved defaults without persisting them", async () => {
    documents.delete("rewards/config");
    loginInput(1);
    const result = await api.awardStudentLogin({...studentScope, loginDate});
    assert.equal(result.dailyReward.award.coins, 1);
    assert.equal(result.streakReward, null);
    assert.equal(documents.has("rewards/config"), false);
  });

  test(layer + ": the login reward API awards all four milestone defaults and zero configurations", async () => {
    savedLoginConfig();
    for (const [days, coins] of [[3, 2], [7, 5], [14, 10], [30, 25]]) {
      const studentId = "milestone-" + days;
      loginInput(days, {studentId});
      const result = await api.awardStudentLogin({studentId, loginDate});
      assert.equal(result.streakReward.award.coins, coins);
      assert.equal(result.streakReward.totalCoins, coins + 1);
    }
    savedLoginConfig({dailyLoginCoins: 0, loginStreakCoins: {"3": 0, "7": 0, "14": 0, "30": 0}});
    const input = loginInput(3, {studentId: "zero-login"});
    const result = await api.awardStudentLogin(input);
    assert.equal(result.dailyReward.award.coins, 0);
    assert.equal(result.streakReward.award.coins, 0);
    const before = writes.length;
    const retry = await api.awardStudentLogin(input);
    assert.equal(retry.dailyReward.alreadyAwarded, true);
    assert.equal(retry.streakReward.alreadyAwarded, true);
    assert.equal(writes.length, before);
  });

  test(layer + ": concurrent login API calls create one daily award and one bonus", async () => {
    savedLoginConfig();
    loginInput(7);
    const input = {...studentScope, loginDate};
    const results = await Promise.all(Array.from({length: 8}, () => api.awardStudentLogin(input)));
    assert.equal(results.filter(result => !result.dailyReward.alreadyAwarded).length, 1);
    assert.equal(results.filter(result => !result.streakReward.alreadyAwarded).length, 1);
    assert.equal(await api.getStudentRewardTotal(studentScope), 6);
    assert.equal(writes.length, 6);
  });

  test(layer + ": missing login records cannot be replaced with caller-provided snapshots", async () => {
    await assert.rejects(() => api.awardStudentLogin({
      ...studentScope, loginDate, currentStreakDays: 3, loggedInAt: timestamp(), coins: 100,
    }), error => error.code === "not-found");
    assert.equal(await api.getStudentRewardTotal(studentScope), 0);
    assert.equal(writes.length, 0);
  });

  test(layer + ": malformed identities and dates fail before any record is read", async () => {
    for (const input of [
      null, {studentId: "bad/id", loginDate}, {studentId: "config", loginDate},
      {...studentScope, loginDate: "2026-02-30"}, {...studentScope},
    ]) await assert.rejects(() => api.awardStudentLogin(input));
    assert.equal(reads.length, 0);
    assert.equal(writes.length, 0);
  });

  test(layer + ": deleted login history and changed config do not change existing rewards", async () => {
    savedLoginConfig();
    loginInput(3);
    const input = {...studentScope, loginDate};
    const first = await api.awardStudentLogin(input);
    documents.delete("studentLogins/student-1/history/" + loginDate);
    savedLoginConfig({dailyLoginCoins: 100, loginStreakCoins: {"3": 200, "7": 5, "14": 10, "30": 25}});
    const configReads = reads.filter(path => path === "rewards/config").length;
    const retry = await api.awardStudentLogin(input);
    assert.deepEqual(retry.dailyReward.award, first.dailyReward.award);
    assert.deepEqual(retry.streakReward.award, first.streakReward.award);
    assert.equal(retry.dailyReward.alreadyAwarded, true);
    assert.equal(retry.streakReward.alreadyAwarded, true);
    assert.equal(retry.streakReward.totalCoins, 3);
    assert.equal(reads.filter(path => path === "rewards/config").length, configReads);
    assert.equal(writes.length, 6);
  });

  test(layer + ": a failed streak bonus resumes its original plan after login history is pruned", async () => {
    savedLoginConfig();
    loginInput(3);
    const input = {...studentScope, loginDate};
    const repository = new Repository();
    const useCase = new LoginReward({
      studentRewardRepository: {
        getById: scope => repository.getById(scope),
        save: award => {
          if (award.categoryId === api.RewardCategory.LOGIN_STREAK) throw new Error("Bonus write unavailable");
          return repository.save(award);
        },
      },
      getStudentLoginRecord: logins.getStudentLoginRecord,
      listStudentLoginHistory: logins.listStudentLoginHistory,
      getRewardConfig: api.getRewardConfig,
    });
    await assert.rejects(() => useCase.execute(input), /Bonus write unavailable/);
    assert.equal(await api.getStudentRewardTotal(studentScope), 1);
    documents.delete("studentLogins/student-1/history/" + loginDate);
    savedLoginConfig({dailyLoginCoins: 100, loginStreakCoins: {"3": 200, "7": 5, "14": 10, "30": 25}});
    const retry = await api.awardStudentLogin(input);
    assert.equal(retry.dailyReward.alreadyAwarded, true);
    assert.equal(retry.streakReward.alreadyAwarded, false);
    assert.equal(retry.streakReward.award.coins, 2);
    assert.equal(retry.streakReward.totalCoins, 3);
    assert.equal(writes.length, 6);
  });

  test(layer + ": legacy login snapshots derive their streak from retained saved days", async () => {
    savedLoginConfig();
    const day = new Date().toISOString().slice(0, 10);
    for (const offset of [0, -1, -2]) {
      loginInput(undefined, {currentStreakDays: undefined, loginDate: shiftLoginDate(day, offset)});
    }
    const result = await api.awardStudentLogin({...studentScope, loginDate: day});
    assert.equal(result.dailyReward.award.details.currentStreakDays, 3);
    assert.equal(result.streakReward.award.coins, 2);
  });

  test(layer + ": saved login read and reward write failures propagate without duplicate awards", async () => {
    savedLoginConfig();
    loginInput(1);
    const input = {...studentScope, loginDate};
    directReadFailure = "studentLogins/student-1/history/" + loginDate;
    await assert.rejects(() => api.awardStudentLogin(input), /Post-commit read failed/);
    assert.equal(writes.length, 0);
    directReadFailure = null;
    writeFailure = new Error("Reward write unavailable");
    await assert.rejects(() => api.awardStudentLogin(input), /Reward write unavailable/);
    assert.equal(writes.length, 0);
    writeFailure = null;
    const retry = await api.awardStudentLogin(input);
    assert.equal(retry.dailyReward.totalCoins, 1);
    assert.equal(writes.length, 3);
  });
}

test("web login awards require a site administrator before any saved records are inspected", async () => {
  const input = {...studentScope, loginDate};
  auth.currentUser = null;
  await assert.rejects(() => web.awardStudentLogin(input), /signed in/);
  auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};
  await assert.rejects(() => web.awardStudentLogin(input), /administrator/);
  auth.currentUser = {...admin, emailVerified: false};
  await assert.rejects(() => web.awardStudentLogin(input), /Verify/);
  assert.equal(reads.length, 0);
  assert.equal(writes.length, 0);
});

test("web login awards recheck the administrator after reads and before a reward write", async () => {
  savedLoginConfig();
  loginInput(3);
  let checks = 0;
  // First authorize the award, then the login read, then the first coin write.
  onAdminCheck = () => {
    if (++checks === 3) auth.currentUser = {...admin, uid: "changed"};
  };
  await assert.rejects(() => web.awardStudentLogin({...studentScope, loginDate}), /account changed/);
  assert.equal(checks, 3);
  assert.equal(writes.length, 0);
});

test("web coin totals stream initial zero and awards for the signed-in student without writes or admin callables", async () => {
  auth.currentUser = {uid: "student-1", emailVerified: false};
  const totals = [];
  const errors = [];
  const stop = web.watchStudentRewardTotal({
    studentId: " student-1 ", onChange: value => totals.push(value), onError: error => errors.push(error),
  });
  assert.equal(typeof stop, "function");
  assert.equal(subscriptions[0].path, studentPath);
  assert.deepEqual(totals, [0]);
  assert.equal(writes.length, 0);
  await backend.saveStudentReward(reward({coins: 25}));
  assert.deepEqual(totals, [0, 25]);
  await backend.saveStudentReward(reward({studentId: "student-2", coins: 10}));
  assert.deepEqual(totals, [0, 25]);
  stop();
  assert.equal(subscriptions[0].active, false);
  await backend.saveStudentReward(reward({awardId: "second-award", coins: 20}));
  assert.deepEqual(totals, [0, 25]);
  assert.deepEqual(errors, []);
  assert.deepEqual(callables, []);
});

test("web coin listener errors and malformed totals are reported instead of emitting a false balance", () => {
  documents.set(studentPath, {totalCoins: 10});
  const totals = [];
  const errors = [];
  const stop = web.watchStudentRewardTotal({
    ...studentScope, onChange: value => totals.push(value), onError: error => errors.push(error),
  });
  documents.set(studentPath, {totalCoins: -1});
  subscriptions[0].onChange(snapshot(studentPath));
  assert.deepEqual(totals, [10]);
  assert.equal(errors.length, 1);
  const readError = new Error("Permission denied");
  subscriptions[0].onError(readError);
  assert.equal(errors.at(-1), readError);
  documents.set(studentPath, {totalCoins: 15});
  subscriptions[0].onChange(snapshot(studentPath));
  assert.deepEqual(totals, [10, 15]);
  assert.equal(writes.length, 0);
  stop();
});

test("web coin listeners validate authentication, student IDs and callbacks before reading", () => {
  const input = {...studentScope, onChange: () => {}, onError: () => {}};
  auth.currentUser = null;
  assert.throws(() => web.watchStudentRewardTotal(input), /signed in/);
  auth.currentUser = {...admin};
  for (const changes of [
    {studentId: "config"}, {studentId: "bad/id"}, {onChange: null}, {onError: null},
  ]) assert.throws(() => web.watchStudentRewardTotal({...input, ...changes}));
  assert.equal(subscriptions.length, 0);
  assert.equal(reads.length, 0);
  assert.equal(writes.length, 0);
});

test("the landing balance updates as the backend login trigger and Daily Mission API award coins", async () => {
  savedLoginConfig();
  loginInput(3);
  const section = {hidden: true};
  const balance = {textContent: ""};
  const status = {textContent: "", hidden: false, classList: {toggle: () => {}}};
  const activityList = {replaceChildren: () => {}};
  const activityStatus = {textContent: "", hidden: false, classList: {toggle: () => {}}};
  const controller = new StudentCoinBalanceController({
    watchStudentRewardTotal: web.watchStudentRewardTotal,
    getRewardConfig: async () => ({recentActivitiesLimit: 5}),
    listRecentStudentRewardActivities: async () => [], defaultRecentActivitiesLimit: 5,
    section, balance, status, activityList, activityStatus,
    formatter: new Intl.NumberFormat("en-US"),
    logError: error => assert.fail(error.message),
  });
  auth.currentUser = {uid: "student-1", emailVerified: false};
  controller.start(studentScope);
  assert.equal(balance.textContent, "0");
  await processStudentLoginRecorded({
    id: "login-event", params: {...studentScope, loginDate},
    data: {data: () => {throw new Error("The trigger must call the Reward feature.");}},
  });
  assert.equal(balance.textContent, "3");
  await backend.awardDailyMissionCompletion(seedDailyMission());
  assert.equal(balance.textContent, "28");
  assert.equal(status.hidden, true);
  assert.equal(section.hidden, false);
  controller.stop();
  assert.equal(subscriptions[0].active, false);
  assert.equal(balance.textContent, "—");
  assert.equal(section.hidden, true);
});

test("web additional mission awards require a site administrator before inspecting student records", async () => {
  auth.currentUser = null;
  await assert.rejects(() => web.awardAdditionalMissionCompletion({...studentScope, practiceId: "additional-1"}), /signed in/);
  auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};
  await assert.rejects(() => web.awardAdditionalMissionCompletion({...studentScope, practiceId: "additional-1"}), /administrator/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

test("web additional mission awards recheck authorization after asynchronous reads", async () => {
  savedLoginConfig();
  const input = seedAdditionalMission();
  let checks = 0;
  onAdminCheck = () => {
    if (++checks === 2) auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};
  };
  await assert.rejects(() => web.awardAdditionalMissionCompletion(input), /account changed|administrator/);
  assert.deepEqual(writes, []);
});

test("backend and web additional award IDs distinguish topics and use unambiguous bounded keys", async () => {
  for (const syllabusId of ["math", "中文课程", "x".repeat(1500)]) {
    const context = {missionDate: "2026-10-01", syllabusId, topicId: "分数"};
    const id = await createAdditionalMissionRewardId(context);
    assert.equal(await webAdditionalMissionRewardId(context), id);
    assert.ok(id.length < 1500);
    assert.notEqual(await createAdditionalMissionRewardId({...context, topicId: "geometry"}), id);
    assert.notEqual(await createAdditionalMissionRewardId({...context, missionDate: "2026-10-02"}), id);
  }
  const first = {missionDate: "2026-10-01", syllabusId: "a-b", topicId: "c"};
  assert.notEqual(await createAdditionalMissionRewardId(first),
    await createAdditionalMissionRewardId({...first, syllabusId: "a", topicId: "b-c"}));
});

for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": every additional topic receives its own coins independently of the daily mission", async () => {
    savedLoginConfig();
    await api.awardDailyMissionCompletion(seedDailyMission());
    await api.awardAdditionalMissionCompletion(seedAdditionalMission());
    await api.awardAdditionalMissionCompletion(seedAdditionalMission({practiceId: "geometry-1", topicId: "geometry"}));
    assert.equal(await api.getStudentRewardTotal(studentScope), 65);
    assert.equal(await api.getStudentRewardCategoryTotal({...studentScope, categoryId: api.RewardCategory.BONUS_MISSION_COMPLETION}), 40);
    const history = await api.listStudentRewardHistory({...studentScope, categoryId: api.RewardCategory.BONUS_MISSION_COMPLETION});
    assert.equal(history.entries.length, 2);
    assert.notEqual(history.entries[0].awardId, history.entries[1].awardId);
  });

  test(layer + ": accepted core missions and invalid scopes cannot receive additional rewards", async () => {
    savedLoginConfig();
    assert.equal(await api.awardAdditionalMissionCompletion(seedDailyMission()), null);
    for (const input of [undefined, {}, {...studentScope, practiceId: ""}, {studentId: "config", practiceId: "p"}]) {
      await assert.rejects(() => api.awardAdditionalMissionCompletion(input));
    }
    assert.deepEqual(writes, []);
  });
}

for (const stage of ["assessment", "generation"]) {
  test("completion trigger: additional reward survives " + stage + " failure and a retry without duplicate coins", async () => {
    savedLoginConfig({bonusMissionCompletionCoins: 35});
    const input = {...seedAdditionalMission(), eventId: "event-additional-completed"};
    const error = new Error(stage + " unavailable");
    let fail = true;
    const operations = {
      assessPractice: async () => {
        assert.equal(await backend.getStudentRewardTotal(studentScope), 35);
        if (fail && stage === "assessment") throw error;
        return {assessed: true, isFrameworkCompleted: false, syllabusId: "math", topicId: "fractions"};
      },
      calculateReadiness: async () => null,
      calculateTopicReliability: async () => ({score: 10, completedPracticeCount: 1}),
      saveTopicReliability: async value => value,
      calculateSubjectReliability: async () => 10,
      saveSubjectReliability: async value => value,
      generatePractice: async () => {
        if (fail && stage === "generation") throw error;
        return {practice: {id: "next-practice"}};
      },
    };
    await assert.rejects(() => assessCompletedStudentPractice(input, operations), actual => actual === error);
    assert.equal(documents.get("studentPractices/student-1/completionProcessing/additional-1").status, "failed");
    savedLoginConfig({bonusMissionCompletionCoins: 100}); fail = false;
    await assessCompletedStudentPractice(input, operations);
    assert.equal(await backend.getStudentRewardTotal(studentScope), 35);
    const history = await backend.listStudentRewardHistory({...studentScope, categoryId: backend.RewardCategory.BONUS_MISSION_COMPLETION});
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0].coins, 35);
    const before = writes.length;
    const duplicate = await assessCompletedStudentPractice(input, {
      awardDailyMission: async () => {throw new Error("must not reward a processed completion");},
      awardAdditionalMission: async () => {throw new Error("must not reward a processed completion");},
    });
    assert.equal(duplicate.alreadyProcessed, true);
    assert.equal(writes.length, before);
  });
}

test("web daily mission awards require a site administrator before inspecting student records", async () => {
  auth.currentUser = null;
  await assert.rejects(() => web.awardDailyMissionCompletion({...studentScope, practiceId: "daily-1"}), /signed in/);
  auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};
  await assert.rejects(() => web.awardDailyMissionCompletion({...studentScope, practiceId: "daily-1"}), /administrator/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});

function seedLevelAssessment({studentId = "student-1", practiceId = "level-practice", syllabusId = "math",
  topicId = "fractions", assessmentFrameworkId = "framework-1", previousLevelId = "foundation",
  levelId = "advanced", reachedLevelIds = ["bridge", "advanced"], completed = true} = {}) {
  documents.set("studentAssessmentProgress/" + studentId + "/practiceAssessments/" + practiceId, {
    syllabusId, topicId, assessmentFrameworkId, previousLevelId, levelId, reachedLevelIds,
    assessed: true, levelChanged: reachedLevelIds.length > 0, isFrameworkCompleted: levelId === "endLevel",
    practiceType: "assessment", score: 95, reason: null, levelName: levelId, assessedAt: timestamp(),
  });
  if (completed) documents.set("studentPractices/" + studentId + "/completedPractices/" + practiceId, {});
  return {studentId, practiceId};
}
function seedLevelConfig(levelCoins = {foundation: 20, bridge: 30, advanced: 45}, assessmentFrameworkId = "framework-1") {
  documents.set("rewards/config/assessmentFrameworks/" + assessmentFrameworkId, {levelCoins, updatedAt: timestamp(), updatedBy: admin.uid});
}
function levelDependencies(Repository, assessmentFeature, changes = {}) {
  return {studentRewardRepository: new Repository(),
    getStudentPracticeAssessment: value => assessmentFeature.getStudentPracticeAssessment(value),
    listCompletedPracticeIds: async ({studentId}) => [...documents.keys()]
      .filter(path => path.startsWith("studentPractices/" + studentId + "/completedPractices/")).map(path => path.split("/").at(-1)),
    getAssessmentFrameworkRewardConfig: async ({assessmentFrameworkId}) => documents.get("rewards/config/assessmentFrameworks/" + assessmentFrameworkId) ?? null,
    ...changes,
  };
}

for (const [layer, api, LevelAward, Repository, assessmentFeature, PreAssessment, PreCalculation, AssessmentRepository] of [
  ["backend", backend, AwardAssessmentLevelUp, FirestoreStudentRewardRepository, backendAssessment, AssessPreAssessmentPractice, CalculatePreAssessmentLevel, FirestoreStudentAssessmentProgressRepository],
  ["web", web, WebAwardAssessmentLevelUp, WebStudentRewardRepository, webAssessment, WebPreAssessment, WebPreCalculation, WebAssessmentRepository],
]) {
  test(layer + ": level jump awards both configured levels atomically and ignores caller amounts and context", async () => {
    seedLevelConfig();
    const input = seedLevelAssessment();
    const result = await api.awardAssessmentLevelUp({...input, coins: 999, levelId: "spoofed", reachedLevelIds: ["foundation"]});
    assert.equal(result.coinsAwarded, 75);
    assert.equal(result.totalCoins, 75);
    assert.equal(result.categoryTotalCoins, 75);
    assert.equal(result.alreadyAwarded, false);
    assert.deepEqual(result.awards.map(award => [award.details.levelId, award.coins]), [["bridge", 30], ["advanced", 45]]);
    assert.ok(result.awards.every(award => award.categoryId === api.RewardCategory.ASSESSMENT_LEVEL && award.sourceId === input.practiceId));
    assert.equal(commitCount, 1);
    assert.equal(writes.length, 4);
    assert.equal((await api.listStudentRewardHistory({...studentScope, categoryId: api.RewardCategory.ASSESSMENT_LEVEL})).entries.length, 2);
  });

  test(layer + ": single level-up uses only the newly reached level", async () => {
    seedLevelConfig();
    const result = await api.awardAssessmentLevelUp(seedLevelAssessment({previousLevelId: "bridge", reachedLevelIds: ["advanced"]}));
    assert.equal(result.coinsAwarded, 45);
    assert.equal(result.awards.length, 1);
    assert.equal(writes.length, 3);
  });

  test(layer + ": missing assessment, no level-up and incomplete practices cannot earn level coins", async () => {
    assert.equal(await api.awardAssessmentLevelUp({...studentScope, practiceId: "missing"}), null);
    assert.equal(await api.awardAssessmentLevelUp(seedLevelAssessment({previousLevelId: null, levelId: "foundation", reachedLevelIds: []})), null);
    const input = seedLevelAssessment({practiceId: "not-completed", completed: false});
    await assert.rejects(() => api.awardAssessmentLevelUp(input), error => error.code === "failed-precondition");
    assert.deepEqual(writes, []);
  });

  test(layer + ": every regular level must be configured before any coins from a jump are saved", async () => {
    seedLevelConfig({bridge: 30});
    const input = seedLevelAssessment();
    await assert.rejects(() => api.awardAssessmentLevelUp(input), error => error.code === "failed-precondition");
    assert.deepEqual(writes, []);
    seedLevelConfig();
    assert.equal((await api.awardAssessmentLevelUp(input)).coinsAwarded, 75);
  });

  test(layer + ": retries retain original coins and history even if config is later deleted", async () => {
    seedLevelConfig();
    const input = seedLevelAssessment();
    const original = await api.awardAssessmentLevelUp(input);
    documents.delete("rewards/config/assessmentFrameworks/framework-1");
    const before = writes.length;
    const retry = await api.awardAssessmentLevelUp(input);
    assert.equal(retry.alreadyAwarded, true);
    assert.equal(retry.coinsAwarded, 0);
    assert.equal(retry.totalCoins, 75);
    assert.deepEqual(retry.awards, original.awards);
    assert.equal(writes.length, before);
  });

  test(layer + ": concurrent calls with changed config retain one complete allocation", async () => {
    const input = seedLevelAssessment();
    let configCalls = 0;
    const useCase = new LevelAward(levelDependencies(Repository, assessmentFeature, {
      getAssessmentFrameworkRewardConfig: async () => ({levelCoins: ++configCalls % 2 ? {bridge: 30, advanced: 45} : {bridge: 100, advanced: 150}}),
    }));
    const results = await Promise.all(Array.from({length: 8}, () => useCase.execute(input)));
    assert.equal(results.filter(result => !result.alreadyAwarded).length, 1);
    assert.ok(results.every(result => JSON.stringify(result.awards.map(award => award.coins)) === JSON.stringify(results[0].awards.map(award => award.coins))));
    assert.ok([75, 250].includes(await api.getStudentRewardTotal(studentScope)));
    assert.equal(writes.length, 4);
  });

  test(layer + ": a level already rewarded by an earlier practice is not rewarded by a later jump", async () => {
    seedLevelConfig();
    await api.awardAssessmentLevelUp(seedLevelAssessment({practiceId: "first", levelId: "bridge", reachedLevelIds: ["bridge"]}));
    const result = await api.awardAssessmentLevelUp(seedLevelAssessment({practiceId: "second"}));
    assert.equal(result.coinsAwarded, 45);
    assert.equal(result.totalCoins, 75);
    assert.equal(result.awards.find(award => award.details.levelId === "bridge").sourceId, "first");
    assert.equal((await api.listStudentRewardHistory({...studentScope, categoryId: api.RewardCategory.ASSESSMENT_LEVEL})).entries.length, 2);
  });

  test(layer + ": students, subjects, topics and frameworks have independent level awards", async () => {
    seedLevelConfig(); seedLevelConfig({bridge: 30, advanced: 45}, "framework-2");
    for (const [index, changes] of [{}, {topicId: "geometry"}, {syllabusId: "science"}, {assessmentFrameworkId: "framework-2"}].entries()) {
      await api.awardAssessmentLevelUp(seedLevelAssessment({practiceId: "practice-" + index, ...changes}));
    }
    assert.equal(await api.getStudentRewardTotal(studentScope), 300);
    await api.awardAssessmentLevelUp(seedLevelAssessment({studentId: "student-2"}));
    assert.equal(await api.getStudentRewardTotal({studentId: "student-2"}), 75);
  });

  test(layer + ": zero allocations are recorded and an absent end-level allocation remains zero on retry", async () => {
    seedLevelConfig({bridge: 0, advanced: 0});
    const input = seedLevelAssessment({previousLevelId: null, levelId: "endLevel", reachedLevelIds: ["bridge", "advanced", "endLevel"]});
    const original = await api.awardAssessmentLevelUp(input);
    assert.equal(original.coinsAwarded, 0);
    assert.equal(original.awards.length, 3);
    seedLevelConfig({bridge: 30, advanced: 45, endLevel: 100});
    const retry = await api.awardAssessmentLevelUp(input);
    assert.equal(retry.coinsAwarded, 0);
    assert.deepEqual(retry.awards, original.awards);
  });

  test(layer + ": configured framework completion coins are awarded separately", async () => {
    seedLevelConfig({bridge: 30, advanced: 45, endLevel: 60});
    const result = await api.awardAssessmentLevelUp(seedLevelAssessment({previousLevelId: "advanced", levelId: "endLevel", reachedLevelIds: ["endLevel"]}));
    assert.equal(result.coinsAwarded, 60);
    assert.equal(result.awards[0].details.levelId, "endLevel");
  });

  test(layer + ": read/write failures and overflow do not partially award a jump", async () => {
    seedLevelConfig(); const input = seedLevelAssessment();
    readFailure = new Error("Read failed");
    await assert.rejects(() => api.awardAssessmentLevelUp(input), /Read failed/);
    readFailure = null;
    writeFailure = new Error("Write failed");
    await assert.rejects(() => api.awardAssessmentLevelUp(input), /Write failed/);
    assert.deepEqual(writes, []);
    writeFailure = null;
    documents.set(studentPath, {totalCoins: Number.MAX_SAFE_INTEGER - 50, updatedAt: timestamp()});
    await assert.rejects(() => api.awardAssessmentLevelUp(input), /safe integer/);
    assert.deepEqual(writes, []);
  });

  test(layer + ": recovery after committed rewards and a failed final read retains the entire original allocation", async () => {
    seedLevelConfig(); const input = seedLevelAssessment();
    const repo = new Repository({
      readDocument: async (path, id) => documents.get(path + "/" + id) ?? null,
      getFirestoreDb: () => db,
      getDocumentRef: (path, id) => {
        const ref = reference(path + "/" + id);
        if (path.endsWith("/categories/assessmentLevel/history")) ref.get = async () => {throw new Error("Final read failed");};
        return ref;
      },
    });
    const useCase = new LevelAward(levelDependencies(Repository, assessmentFeature, {studentRewardRepository: repo}));
    await assert.rejects(() => useCase.execute(input), /Final read failed/);
    assert.equal(documents.get(studentPath).totalCoins, 75);
    seedLevelConfig({bridge: 100, advanced: 150});
    const retry = await api.awardAssessmentLevelUp(input);
    assert.equal(retry.alreadyAwarded, true);
    assert.deepEqual(retry.awards.map(award => award.coins), [30, 45]);
    assert.equal(writes.length, 4);
  });

  test(layer + ": actual high pre-assessment persists both level rewards while first-level placement earns none", async () => {
    seedLevelConfig();
    for (const [index, target] of ["foundation", "advanced"].entries()) {
      const practiceId = "pre-" + index;
      const bands = require("../../../functions/schema/assessment_framework_schema").assessmentFrameworkPreAssessmentScoreBands;
      const calculate = new PreCalculation({getById: async () => ({
        id: "framework-1", endLevelName: "Ready",
        levels: ["foundation", "bridge", "advanced"].map((id, index) => ({id, sequenceOrder: index + 1, levelName: id})),
        preAssessment: {scoreLevelSplit: Object.fromEntries(bands.map(band => [band.field, target]))},
      })});
      const useCase = new PreAssessment({studentAssessmentProgressRepository: new AssessmentRepository(),
        getSyllabusById: async () => ({id: "math", assessmentFrameworkId: "framework-1", topics: [{id: "topic-" + index}]}),
        calculatePreAssessmentLevel: value => calculate.execute(value),
      });
      documents.set("studentPractices/student-1/completedPractices/" + practiceId, {});
      await useCase.execute({studentId: "student-1",
        practice: {id: practiceId, type: "pre assessment", questions: [{syllabusId: "math", topicId: "topic-" + index}]},
        practiceResult: {practiceId, score: 95, submittedAt: new Date(baseSeconds * 1000)},
      });
      const result = await api.awardAssessmentLevelUp({...studentScope, practiceId});
      if (index === 0) assert.equal(result, null);
      else assert.equal(result.coinsAwarded, 75);
    }
  });
}

for (const stage of ["reward", "generation"]) {
  test("completion trigger: retries after " + stage + " failure retain the saved pre-assessment jump and award both levels once", async () => {
    seedLevelConfig(stage === "reward" ? {bridge: 30} : {bridge: 30, advanced: 45});
    const scope = {studentId: "student-1", practiceId: "pre-trigger"};
    documents.set("studentPractices/student-1/completedPractices/pre-trigger", {});
    const bands = require("../../../functions/schema/assessment_framework_schema").assessmentFrameworkPreAssessmentScoreBands;
    let calculationCalls = 0;
    const calculate = new CalculatePreAssessmentLevel({getById: async () => ({
      id: "framework-1", endLevelName: "Ready",
      levels: ["foundation", "bridge", "advanced"].map(id => ({id, levelName: id})),
      preAssessment: {scoreLevelSplit: Object.fromEntries(bands.map(band => [band.field, "advanced"]))},
    })});
    const assessment = new AssessPreAssessmentPractice({
      studentAssessmentProgressRepository: new FirestoreStudentAssessmentProgressRepository(),
      getSyllabusById: async () => ({id: "math", assessmentFrameworkId: "framework-1", topics: [{id: "fractions"}]}),
      calculatePreAssessmentLevel: async value => {calculationCalls++; return calculate.execute(value);},
    });
    let fail = true;
    const operations = {
      assessPractice: value => assessment.execute({studentId: value.studentId,
        practice: {id: value.practiceId, type: "pre assessment", questions: [{syllabusId: "math", topicId: "fractions"}]},
        practiceResult: {practiceId: value.practiceId, score: 95, submittedAt: new Date(baseSeconds * 1000)},
      }),
      calculateReadiness: async () => null,
      calculateTopicReliability: async () => ({score: 10, completedPracticeCount: 1}),
      saveTopicReliability: async value => value, calculateSubjectReliability: async () => 10, saveSubjectReliability: async value => value,
      generatePractice: async () => {if (fail && stage === "generation") throw new Error("Generation failed"); return {practice: {id: "next"}};},
    };
    const event = {...scope, eventId: "level-event"};
    await assert.rejects(() => assessCompletedStudentPractice(event, operations));
    assert.equal(documents.get("studentPractices/student-1/completionProcessing/pre-trigger").status, "failed");
    const saved = await backendAssessment.getStudentPracticeAssessment(scope);
    assert.deepEqual(saved.reachedLevelIds, ["bridge", "advanced"]);
    assert.equal(saved.levelChanged, true);
    assert.equal(documents.get("studentAssessmentProgress/student-1/syllabuses/math/topics/fractions").currentLevelId, "advanced");
    seedLevelConfig(stage === "reward" ? {bridge: 30, advanced: 45} : {bridge: 100, advanced: 150});
    fail = false;
    await assessCompletedStudentPractice(event, operations);
    assert.equal(calculationCalls, 1);
    assert.equal(await backend.getStudentRewardTotal(studentScope), 75);
    const history = await backend.listStudentRewardHistory({...studentScope, categoryId: backend.RewardCategory.ASSESSMENT_LEVEL});
    assert.equal(history.entries.length, 2);
    assert.deepEqual(history.entries.map(award => award.coins).sort((a, b) => a - b), [30, 45]);
    const before = writes.length;
    const duplicate = await assessCompletedStudentPractice(event, {
      awardLevelUp: async () => {throw new Error("must not reward processed practice");},
    });
    assert.equal(duplicate.alreadyProcessed, true);
    assert.equal(writes.length, before);
  });
}

test("web level-up rewards require an administrator and recheck authorization before writing", async () => {
  const input = seedLevelAssessment(); seedLevelConfig();
  auth.currentUser = null;
  await assert.rejects(() => web.awardAssessmentLevelUp(input), /signed in/);
  auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};
  await assert.rejects(() => web.awardAssessmentLevelUp(input), /administrator/);
  assert.deepEqual(reads, []);
  auth.currentUser = {...admin};
  let checks = 0;
  onAdminCheck = () => {if (++checks === 2) auth.currentUser = {uid: "student-1", email: "student@example.com", emailVerified: true};};
  await assert.rejects(() => web.awardAssessmentLevelUp(input), /account changed|administrator/);
  assert.deepEqual(writes, []);
});

test("backend and web level award IDs are bounded, unambiguous and distinguish every scope", async () => {
  const context = {syllabusId: "math", topicId: "分数", assessmentFrameworkId: "framework-1", levelId: "advanced"};
  const id = await createAssessmentLevelRewardId(context);
  assert.equal(await webLevelRewardId(context), id);
  for (const key of Object.keys(context)) assert.notEqual(await createAssessmentLevelRewardId({...context, [key]: "other"}), id);
  assert.ok((await createAssessmentLevelRewardId({...context, syllabusId: "x".repeat(1500)})).length < 1500);
});

test("landing coin balance updates once with the sum of both level rewards", async () => {
  seedLevelConfig(); const input = seedLevelAssessment();
  const section = {hidden: true}, balance = {textContent: ""};
  const status = {hidden: true, textContent: "", classList: {toggle: () => {}}};
  const activityList = {replaceChildren: () => {}};
  const activityStatus = {textContent: "", hidden: false, classList: {toggle: () => {}}};
  const controller = new StudentCoinBalanceController({
    watchStudentRewardTotal: web.watchStudentRewardTotal,
    getRewardConfig: async () => ({recentActivitiesLimit: 5}),
    listRecentStudentRewardActivities: async () => [], defaultRecentActivitiesLimit: 5,
    section, balance, status, activityList, activityStatus,
  });
  controller.start(studentScope);
  assert.equal(balance.textContent, "0");
  await backend.awardAssessmentLevelUp(input);
  assert.equal(balance.textContent, "75");
  controller.stop();
});

test("backend and web use the same bounded subject/day award identity", async () => {
  const {createDailyMissionRewardId: backendId} = require("../../../functions/features/reward/domain/daily_mission_reward_id.js");
  for (const syllabusId of ["math", "中文课程", "x".repeat(1500)]) {
    const context = {missionDate: "2026-10-01", syllabusId};
    const id = await backendId(context);
    assert.equal(await webDailyMissionRewardId(context), id);
    assert.ok(id.length < 1500);
    assert.notEqual(await backendId({...context, missionDate: "2026-10-02"}), id);
  }
});
