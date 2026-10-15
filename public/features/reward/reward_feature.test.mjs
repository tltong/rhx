import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import * as web from "./reward_module.js";
import * as webSchema from "../../config/firebase/reward_schema.js";

const require = createRequire(import.meta.url);
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalBackendOps = {...backendOps};
const originalFirebase = globalThis.firebase;
const documents = new Map();
const reads = [];
const writes = [];
const callables = [];
const adminUser = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...adminUser}};
const baseTime = new Date("2026-10-10T00:00:00Z");
const configPath = "rewards/config";
const frameworkPath = configPath + "/assessmentFrameworks/framework-1";
const scope = {assessmentFrameworkId: "framework-1"};
const criteria = {requiredPracticeCount: 3, minimumScore: 75, questionsPerPractice: 10, difficultyLevel: "easy"};
let readFailure = null;
let writeFailure = null;
let onAdminCheck = null;

function snapshot(path) {
  return {id: path.split("/").at(-1), exists: documents.has(path), data: () => documents.get(path)};
}
function checkRead(path) {
  reads.push(path);
  if (readFailure) throw readFailure;
}
function reference(path) {
  return {
    id: path.split("/").at(-1), path,
    async get() { checkRead(path); return snapshot(path); },
    async set(data, options) {
      if (writeFailure) throw writeFailure;
      writes.push({path, data, options});
      const timestamp = new Date(baseTime.getTime() + writes.length * 1000);
      const saved = {...data, updatedAt: {toDate: () => timestamp}};
      documents.set(path, options?.merge ? {...documents.get(path), ...saved} : saved);
    },
  };
}
function collection(path) {
  return {
    doc(id) { return reference(path + "/" + id); },
    async get() {
      checkRead(path);
      return {docs: [...documents.keys()].filter((key) => (
        key.startsWith(path + "/") && key.slice(path.length + 1).split("/").length === 1
      )).map(snapshot)};
    },
  };
}
const db = {collection};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
const app = {
  firestore: () => db, auth: () => auth,
  functions(region) {
    assert.equal(region, "us-central1");
    return {httpsCallable(name) {
      assert.equal(name, "isCurrentUserSiteAdmin", "Reward APIs must not use new Firebase callable gateways.");
      return async () => {
        callables.push(name);
        const user = auth.currentUser;
        const status = {
          email: user?.email || null, emailVerified: user?.emailVerified === true,
          isAdmin: user?.email === adminUser.email, bootstrapAvailable: false,
        };
        onAdminCheck?.();
        return {data: status};
      };
    }};
  },
};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.readDocument = async (path, id) => {
  const record = await reference(path + "/" + id).get();
  return record.exists ? {...record.data(), id: record.id} : null;
};
backendOps.readCollection = async (path) => (
  (await collection(path).get()).docs.map((record) => ({...record.data(), id: record.id}))
);
backendOps.writeDocument = (path, id, data, options) => reference(path + "/" + id).set(data, options);
const backend = require("../../../functions/features/reward/reward_module.js");
const backendSchema = require("../../../functions/schema/reward_schema.js");

function seedFramework(id = "framework-1", levelIds = ["intro", "developing", "proficient"]) {
  documents.set("assessmentFrameworks/" + id, {name: id, endLevelName: "Mastered"});
  levelIds.forEach((levelId, index) => {
    documents.set("assessmentFrameworks/" + id + "/levels/" + levelId, {
      levelName: "Level " + (index + 1), sequenceOrder: index + 1, criteria,
    });
  });
}
function configInput(changes = {}) {
  return {...web.DEFAULT_REWARD_CONFIG, loginStreakCoins: {...web.DEFAULT_REWARD_CONFIG.loginStreakCoins}, ...changes};
}
function frameworkInput(changes = {}) {
  return {...scope, levelCoins: {intro: 20, developing: 30, proficient: 45}, ...changes};
}
function saveGlobal(api, input, context = {updatedBy: "admin-1"}) {
  return api === backend ? api.saveRewardConfig(input, context) : api.saveRewardConfig(input);
}
function saveFramework(api, input, context = {updatedBy: "admin-1"}) {
  return api === backend ? api.saveAssessmentFrameworkRewardConfig(input, context) : api.saveAssessmentFrameworkRewardConfig(input);
}
beforeEach(() => {
  documents.clear(); reads.length = 0; writes.length = 0; callables.length = 0;
  readFailure = null; writeFailure = null; onAdminCheck = null;
  auth.currentUser = {...adminUser};
  seedFramework();
});
after(() => {
  Object.assign(backendOps, originalBackendOps);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});
test("backend and web share the reward schema and exact defaults", () => {
  assert.deepEqual(webSchema.rewardConfigSchema, backendSchema.rewardConfigSchema);
  assert.deepEqual(backend.DEFAULT_REWARD_CONFIG, {
    dailyLoginCoins: 1, dailyMissionCompletionCoins: 25, bonusMissionCompletionCoins: 20,
    recentActivitiesLimit: 5,
    loginStreakCoins: {"3": 2, "7": 5, "14": 10, "30": 25},
  });
  assert.deepEqual(web.DEFAULT_REWARD_CONFIG, backend.DEFAULT_REWARD_CONFIG);
  assert.ok(Object.isFrozen(web.DEFAULT_REWARD_CONFIG.loginStreakCoins));
});
test("reward admin exposes the configurable recent activity count", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("./pages/admin/reward_admin.html", import.meta.url), "utf8"),
    readFile(new URL("./pages/admin/reward_admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /name="recentActivitiesLimit"[^>]+min="1"[^>]+max="50"/);
  assert.match(script, /recentActivitiesLimit:\s*values\.recentActivitiesLimit/);
});
for (const [layer, api] of [["backend", backend], ["web", web]]) {
  test(layer + ": unsaved configuration reads return null and never persist defaults", async () => {
    assert.equal(await api.getRewardConfig(), null);
    assert.equal(await api.getAssessmentFrameworkRewardConfig(scope), null);
    assert.deepEqual(writes, []);
    assert.deepEqual(callables, []);
  });
  test(layer + ": global configuration round trips only the configured fields and trusted metadata", async () => {
    const input = configInput({dailyLoginCoins: 0, updatedBy: "spoofed", updatedAt: new Date(0), extra: true});
    const copy = structuredClone(input);
    const saved = await saveGlobal(api, input);
    assert.equal(saved.dailyLoginCoins, 0);
    assert.equal(saved.updatedBy, "admin-1");
    assert.equal(saved.updatedAt.getTime(), baseTime.getTime() + 1000);
    assert.deepEqual(input, copy);
    assert.ok(Object.isFrozen(saved.loginStreakCoins));
    assert.deepEqual(await api.getRewardConfig(), saved);
    assert.deepEqual(Object.keys(documents.get(configPath)).sort(), [
      "bonusMissionCompletionCoins", "dailyLoginCoins", "dailyMissionCompletionCoins", "loginStreakCoins", "recentActivitiesLimit", "updatedAt", "updatedBy",
    ]);
    assert.equal(writes[0].options.merge, false);
    assert.equal(writes[0].path, configPath);
  });
  test(layer + ": global saves reject missing, malformed and unsafe coin amounts without writes", async () => {
    for (const value of [undefined, null, -1, 1.5, "25", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true]) {
      await assert.rejects(() => saveGlobal(api, configInput({dailyLoginCoins: value})), /whole number/);
      await assert.rejects(() => saveGlobal(api, configInput({dailyMissionCompletionCoins: value})), /whole number/);
      await assert.rejects(() => saveGlobal(api, configInput({bonusMissionCompletionCoins: value})), /whole number/);
      await assert.rejects(() => saveGlobal(api, configInput({loginStreakCoins: {...web.DEFAULT_REWARD_CONFIG.loginStreakCoins, "14": value}})), /whole number/);
    }
    for (const input of [null, [], new Date(), {}]) await assert.rejects(() => saveGlobal(api, input));
    for (const recentActivitiesLimit of [null, 0, -1, 1.5, "5", 51, Infinity, true]) {
      await assert.rejects(() => saveGlobal(api, configInput({recentActivitiesLimit})), /recentActivitiesLimit/);
    }
    await assert.rejects(() => saveGlobal(api, configInput({loginStreakCoins: {"3": 2}})));
    await assert.rejects(() => saveGlobal(api, configInput({loginStreakCoins: {...web.DEFAULT_REWARD_CONFIG.loginStreakCoins, "90": 100}})), /only/);
    assert.deepEqual(writes, []);
  });
  test(layer + ": zero and maximum safe integer coin values are accepted", async () => {
    const saved = await saveGlobal(api, configInput({dailyLoginCoins: Number.MAX_SAFE_INTEGER}));
    assert.equal(saved.dailyLoginCoins, Number.MAX_SAFE_INTEGER);
    const framework = await saveFramework(api, frameworkInput({levelCoins: {intro: 0, developing: Number.MAX_SAFE_INTEGER, proficient: 1}}));
    assert.deepEqual(framework.levelCoins, {intro: 0, developing: Number.MAX_SAFE_INTEGER, proficient: 1});
  });
  test(layer + ": older saved configurations use the default recent activity count", async () => {
    const legacy = configInput();
    delete legacy.recentActivitiesLimit;
    documents.set(configPath, {...legacy, updatedAt: baseTime, updatedBy: "admin-1"});
    assert.equal((await api.getRewardConfig()).recentActivitiesLimit, 5);
  });
  test(layer + ": dynamic framework maps round trip and remain isolated from globals and other frameworks", async () => {
    seedFramework("framework-2", ["foundation", "advanced"]);
    const input = frameworkInput({updatedBy: "spoofed"});
    const copy = structuredClone(input);
    const saved = await saveFramework(api, input);
    assert.equal(saved.assessmentFrameworkId, "framework-1");
    assert.equal(saved.updatedBy, "admin-1");
    assert.ok(Object.isFrozen(saved.levelCoins));
    assert.deepEqual(saved.levelCoins, input.levelCoins);
    assert.deepEqual(input, copy);
    assert.deepEqual(await api.getAssessmentFrameworkRewardConfig(scope), saved);
    assert.equal(await api.getRewardConfig(), null);
    await saveFramework(api, {assessmentFrameworkId: "framework-2", levelCoins: {foundation: 1, advanced: 2}});
    await saveGlobal(api, configInput());
    assert.deepEqual((await api.getAssessmentFrameworkRewardConfig(scope)).levelCoins, input.levelCoins);
    assert.deepEqual(Object.keys(documents.get(frameworkPath)).sort(), ["levelCoins", "updatedAt", "updatedBy"]);
    assert.ok(writes.every(({path, options}) => path.startsWith("rewards/config") && options.merge === false));
    assert.equal([...documents.keys()].filter((path) => path.startsWith("rewards/")).length, 3);
  });
  test(layer + ": final level coins are optional and replaced rather than retained on omission", async () => {
    await saveFramework(api, frameworkInput({levelCoins: {intro: 20, developing: 30, proficient: 45, endLevel: 60}}));
    assert.equal((await api.getAssessmentFrameworkRewardConfig(scope)).levelCoins.endLevel, 60);
    await saveFramework(api, frameworkInput());
    assert.equal(Object.hasOwn((await api.getAssessmentFrameworkRewardConfig(scope)).levelCoins, "endLevel"), false);
  });
  test(layer + ": saves validate current levels while reads retain saved maps when frameworks change", async () => {
    await saveFramework(api, frameworkInput());
    documents.set("assessmentFrameworks/framework-1/levels/expert", {levelName: "Expert", sequenceOrder: 4, criteria});
    assert.deepEqual((await api.getAssessmentFrameworkRewardConfig(scope)).levelCoins, frameworkInput().levelCoins);
    const count = writes.length;
    await assert.rejects(() => saveFramework(api, frameworkInput()), /required.*expert/);
    assert.equal(writes.length, count);
    await saveFramework(api, frameworkInput({levelCoins: {...frameworkInput().levelCoins, expert: 60}}));
    documents.delete("assessmentFrameworks/framework-1/levels/developing");
    await assert.rejects(() => saveFramework(api, frameworkInput({levelCoins: {...frameworkInput().levelCoins, expert: 60}})), /not in this framework/);
    await saveFramework(api, frameworkInput({levelCoins: {intro: 20, proficient: 45, expert: 60}}));
    assert.equal(Object.hasOwn(documents.get(frameworkPath).levelCoins, "developing"), false);
  });
  test(layer + ": unknown frameworks and incomplete or unknown level maps cannot be saved", async () => {
    await assert.rejects(() => saveFramework(api, frameworkInput({assessmentFrameworkId: "missing"})), (error) => error.code === "not-found");
    for (const levelCoins of [{intro: 20}, {}, {intro: 20, developing: 30, proficient: 45, mystery: 90}]) {
      await assert.rejects(() => saveFramework(api, frameworkInput({levelCoins})));
    }
    assert.deepEqual(writes, []);
  });
  test(layer + ": malformed scopes, maps and individual allocations fail before persistence", async () => {
    for (const assessmentFrameworkId of ["", " ", "nested/id", ".", "..", null, 1]) {
      await assert.rejects(() => api.getAssessmentFrameworkRewardConfig({assessmentFrameworkId}));
      await assert.rejects(() => saveFramework(api, frameworkInput({assessmentFrameworkId})));
    }
    for (const levelCoins of [null, [], new Date(), {" bad ": 1}, {"nested/id": 1}, {intro: -1}, {intro: 1.5}, {intro: "20"}]) {
      await assert.rejects(() => saveFramework(api, frameworkInput({levelCoins})));
    }
    assert.deepEqual(writes, []);
  });
  test(layer + ": arbitrary level counts and empty frameworks are supported", async () => {
    const ids = Array.from({length: 13}, (_, index) => "stage_" + (index + 1));
    seedFramework("many", ids);
    const levelCoins = Object.fromEntries(ids.map((id, index) => [id, index * 7]));
    assert.deepEqual((await saveFramework(api, {assessmentFrameworkId: "many", levelCoins})).levelCoins, levelCoins);
    seedFramework("empty", []);
    assert.deepEqual((await saveFramework(api, {assessmentFrameworkId: "empty", levelCoins: {}})).levelCoins, {});
  });
  test(layer + ": persistence failures propagate and do not create configuration", async () => {
    readFailure = new Error("Read unavailable");
    await assert.rejects(() => api.getRewardConfig(), /Read unavailable/);
    await assert.rejects(() => api.getAssessmentFrameworkRewardConfig(scope), /Read unavailable/);
    await assert.rejects(() => saveFramework(api, frameworkInput()), /Read unavailable/);
    readFailure = null;
    writeFailure = new Error("Write unavailable");
    await assert.rejects(() => saveGlobal(api, configInput()), /Write unavailable/);
    await assert.rejects(() => saveFramework(api, frameworkInput()), /Write unavailable/);
    assert.deepEqual(writes, []);
  });
  test(layer + ": corrupt persisted amounts and metadata are reported rather than silently defaulted", async () => {
    documents.set(configPath, {...configInput(), dailyLoginCoins: -1, updatedAt: baseTime, updatedBy: "admin-1"});
    await assert.rejects(() => api.getRewardConfig(), /whole number/);
    documents.set(configPath, {...configInput(), updatedAt: null, updatedBy: "admin-1"});
    await assert.rejects(() => api.getRewardConfig(), /timestamp/);
    documents.set(frameworkPath, {levelCoins: {intro: 20}, updatedAt: baseTime, updatedBy: ""});
    await assert.rejects(() => api.getAssessmentFrameworkRewardConfig(scope), /administrator UID/);
    assert.deepEqual(writes, []);
  });
}
test("backend configuration saves require trusted caller context", async () => {
  for (const context of [null, {}, {updatedBy: ""}, {updatedBy: 123}]) {
    await assert.rejects(() => backend.saveRewardConfig(configInput({updatedBy: "spoofed"}), context), /administrator UID/);
    await assert.rejects(() => backend.saveAssessmentFrameworkRewardConfig(frameworkInput({updatedBy: "spoofed"}), context), /administrator UID/);
  }
  assert.deepEqual(writes, []);
});
test("web reads and writes require authentication", async () => {
  auth.currentUser = null;
  await assert.rejects(() => web.getRewardConfig(), /signed in/);
  await assert.rejects(() => web.getAssessmentFrameworkRewardConfig(scope), /signed in/);
  await assert.rejects(() => web.saveRewardConfig(configInput()), /signed in/);
  await assert.rejects(() => web.saveAssessmentFrameworkRewardConfig(frameworkInput()), /signed in/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
});
test("web saves reject non-administrators and unverified administrators", async () => {
  for (const user of [
    {uid: "student-1", email: "student@example.com", emailVerified: true},
    {...adminUser, emailVerified: false},
  ]) {
    auth.currentUser = user;
    await assert.rejects(() => web.saveRewardConfig(configInput()));
    await assert.rejects(() => web.saveAssessmentFrameworkRewardConfig(frameworkInput()));
  }
  assert.deepEqual(writes, []);
});
test("web saves reject account changes during administrator verification", async () => {
  for (const save of [
    () => web.saveRewardConfig(configInput()),
    () => web.saveAssessmentFrameworkRewardConfig(frameworkInput()),
  ]) {
    auth.currentUser = {...adminUser};
    onAdminCheck = () => { auth.currentUser = {...adminUser, uid: "changed-uid"}; };
    await assert.rejects(save, /account changed/);
    auth.currentUser = {...adminUser};
    onAdminCheck = () => { auth.currentUser = null; };
    await assert.rejects(save, /signed in/);
  }
  assert.deepEqual(writes, []);
});
