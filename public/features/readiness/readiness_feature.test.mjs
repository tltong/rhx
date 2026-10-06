import assert from "node:assert/strict";
import {after, beforeEach, test} from "node:test";
import {createRequire} from "node:module";
import * as webSchema from "../../config/firebase/readiness_config_schema.js";
import * as webDomain from "./domain/readiness_config.js";
import {
  DifficultyLevel,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
  getReadinessConfig,
  saveReadinessConfig,
  getDifficultyWeight,
  getReadinessPracticeCount,
  setReadinessPracticeCount,
  getPreAssessmentWeight,
  setPreAssessmentWeight
} from "./readiness_module.js";

const require = createRequire(import.meta.url);
const backendSchema = require("../../../functions/schema/readiness_config_schema.js");
const backendDomain = require("../../../functions/features/readiness/domain/readiness_config.js");
const backendOps = require("../../../functions/utils/firebase/firebase_ops.js");
const originalBackendOps = {...backendOps};
const originalFirebase = globalThis.firebase;
let stored = null;
let readFailure = null;
let writeFailure = null;
let onAdminCheck = null;
const calls = [];
const reads = [];
const writes = [];
const updatedAt = new Date("2026-10-06T05:00:00Z");
const adminUser = {uid: "admin-1", email: "admin@example.com", emailVerified: true};
const auth = {currentUser: {...adminUser}};
const documentSnapshot = () => ({
  exists: stored !== null,
  id: "default",
  data: () => stored
});
const db = {
  collection(collection) {
    return {
      doc(id) {
        return {
          path: collection + "/" + id,
          async get() {
            reads.push({collection, id});
            if (readFailure) throw readFailure;
            return documentSnapshot();
          }
        };
      }
    };
  },
  async runTransaction(operation) {
    if (writeFailure) throw writeFailure;
    return operation({
      get: (reference) => reference.get(),
      set(reference, data, options) {
        writes.push({path: reference.path, data, options});
        stored = {...data, updatedAt: {toDate: () => updatedAt}};
      }
    });
  }
};
const firestore = () => db;
firestore.FieldValue = {serverTimestamp: () => "server-timestamp"};
const app = {
  firestore: () => db,
  auth: () => auth,
  functions(region) {
    assert.equal(region, "us-central1");
    return {
      httpsCallable(name) {
        assert.equal(name, "isCurrentUserSiteAdmin", "readiness must not invoke Firebase callables");
        return async (data) => {
          calls.push({name, data});
          const user = auth.currentUser;
          const status = {
            email: user?.email || null,
            emailVerified: user?.emailVerified === true,
            isAdmin: user?.email === adminUser.email,
            bootstrapAvailable: false
          };
          onAdminCheck?.();
          return {data: status};
        };
      }
    };
  }
};
globalThis.firebase = {apps: [], firestore, initializeApp: () => app};
backendOps.readDocument = async (collection, id) => {
  const snapshot = await db.collection(collection).doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
};
backendOps.getDocumentRef = (collection, id) => db.collection(collection).doc(id);
backendOps.getFirestoreDb = () => db;
const backend = require("../../../functions/features/readiness/readiness_module.js");

after(() => {
  Object.assign(backendOps, originalBackendOps);
  if (originalFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = originalFirebase;
});
beforeEach(() => {
  stored = null;
  readFailure = null;
  writeFailure = null;
  onAdminCheck = null;
  auth.currentUser = {...adminUser};
  calls.length = 0;
  reads.length = 0;
  writes.length = 0;
});

test("browser and backend schemas use the same frozen difficulty enum and configuration shape", () => {
  assert.deepEqual(DifficultyLevel, {EASY: "easy", MEDIUM: "medium", HARD: "hard"});
  assert.ok(Object.isFrozen(DifficultyLevel));
  assert.deepEqual(webSchema.readinessConfigSchema, backendSchema.readinessConfigSchema);
  assert.deepEqual(webSchema.readinessDifficultySchema.enum, Object.values(DifficultyLevel));
  assert.deepEqual(DifficultyLevel, backendSchema.DifficultyLevel);
  assert.deepEqual(DEFAULT_DIFFICULTY_WEIGHTS, backendSchema.DEFAULT_DIFFICULTY_WEIGHTS);
  assert.deepEqual(DEFAULT_DIFFICULTY_WEIGHTS, {easy: 0.75, medium: 1, hard: 1.75});
  assert.equal(DEFAULT_NUMBER_OF_PRACTICES, 5);
  assert.equal(DEFAULT_PRE_ASSESSMENT_WEIGHT, 1);
  assert.equal(DEFAULT_NUMBER_OF_PRACTICES, backendSchema.DEFAULT_NUMBER_OF_PRACTICES);
  assert.equal(DEFAULT_PRE_ASSESSMENT_WEIGHT, backendSchema.DEFAULT_PRE_ASSESSMENT_WEIGHT);
});

test("unsaved configuration stays null and weight lookup fails without persisting defaults", async () => {
  assert.equal(await getReadinessConfig(), null);
  await assert.rejects(() => getDifficultyWeight(DifficultyLevel.EASY), (error) => error.code === "failed-precondition");
  await assert.rejects(() => getReadinessPracticeCount(), (error) => error.code === "failed-precondition");
  await assert.rejects(() => getPreAssessmentWeight(), (error) => error.code === "failed-precondition");
  assert.deepEqual(writes, []);
});

test("web feature APIs save directly to Firestore and retrieve every configured enum weight", async () => {
  const config = await saveReadinessConfig({difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS, updatedBy: "spoofed"});
  assert.ok(config.updatedAt instanceof Date);
  assert.equal(config.updatedAt.toISOString(), updatedAt.toISOString());
  assert.equal(config.updatedBy, "admin-1");
  assert.deepEqual((await getReadinessConfig()).difficultyWeights, DEFAULT_DIFFICULTY_WEIGHTS);
  for (const difficulty of Object.values(DifficultyLevel)) {
    assert.equal(await getDifficultyWeight(difficulty), DEFAULT_DIFFICULTY_WEIGHTS[difficulty]);
  }
  assert.equal(await getDifficultyWeight(" HARD "), 1.75);
  assert.deepEqual(calls.map(({name}) => name), ["isCurrentUserSiteAdmin"]);
  assert.deepEqual(writes, [{
    path: "readinessConfigs/default",
    data: {difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS, numberOfPractices: 5, preAssessmentWeight: 1, updatedAt: "server-timestamp", updatedBy: "admin-1"},
    options: {merge: false}
  }]);
});

test("subsequent saves replace the current weights without revision metadata", async () => {
  await saveReadinessConfig({difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS});
  await saveReadinessConfig({difficultyWeights: {easy: 2, medium: 3, hard: 4}});
  assert.equal(await getDifficultyWeight(DifficultyLevel.HARD), 4);
  assert.deepEqual(Object.keys(await getReadinessConfig()).sort(), ["difficultyWeights", "numberOfPractices", "preAssessmentWeight", "updatedAt", "updatedBy"]);
});

test("web parameter APIs update Firestore directly without changing other settings", async () => {
  const initial = await saveReadinessConfig({difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS});
  assert.equal(initial.numberOfPractices, 5);
  assert.equal(initial.preAssessmentWeight, 1);
  assert.equal(await setReadinessPracticeCount(8), 8);
  assert.equal(await getReadinessPracticeCount(), 8);
  assert.equal(await getPreAssessmentWeight(), 1);
  assert.equal(await setPreAssessmentWeight(2.5), 2.5);
  assert.equal(await getPreAssessmentWeight(), 2.5);
  assert.equal(await getReadinessPracticeCount(), 8);
  await saveReadinessConfig({difficultyWeights: {easy: 0.5, medium: 1, hard: 2}});
  const current = await getReadinessConfig();
  assert.equal(current.numberOfPractices, 8);
  assert.equal(current.preAssessmentWeight, 2.5);
  assert.equal(await getDifficultyWeight(DifficultyLevel.HARD), 2);
  assert.ok(calls.every(({name}) => name === "isCurrentUserSiteAdmin"));
  assert.equal(writes.length, 4);
});

test("web and backend layers reject malformed practice counts and pre-assessment weights", async () => {
  for (const domain of [webDomain, backendDomain]) {
    for (const numberOfPractices of [0, -1, 1.5, "5", undefined, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => domain.normalizeReadinessConfigChanges({numberOfPractices}), /positive integer/);
    }
    for (const preAssessmentWeight of [0, -1, NaN, Infinity, "1", null, undefined]) {
      assert.throws(() => domain.normalizeReadinessConfigChanges({preAssessmentWeight}), /greater than zero/);
    }
  }
  await assert.rejects(() => setReadinessPracticeCount(2.5), /positive integer/);
  await assert.rejects(() => setPreAssessmentWeight(0), /greater than zero/);
  assert.deepEqual(calls, []);
});

test("both layers reject nonnumeric, nonpositive and incomplete weight maps", async () => {
  for (const domain of [webDomain, backendDomain]) {
    for (const value of [0, -1, NaN, Infinity, -Infinity, "0.75", null, true, undefined]) {
      assert.throws(() => domain.normalizeDifficultyWeights({...DEFAULT_DIFFICULTY_WEIGHTS, easy: value}), /finite number greater than zero/);
    }
    for (const weights of [null, [], {easy: 1, medium: 1}, {...DEFAULT_DIFFICULTY_WEIGHTS, extreme: 2}, {Easy: 1, Medium: 1, Hard: 1}]) {
      assert.throws(() => domain.normalizeDifficultyWeights(weights), /difficultyWeights/);
    }
  }
  await assert.rejects(() => saveReadinessConfig({difficultyWeights: {...DEFAULT_DIFFICULTY_WEIGHTS, easy: 0}}), /greater than zero/);
  await assert.rejects(() => getDifficultyWeight("extreme"), /difficultyLevel/);
  assert.deepEqual(calls, []);
  assert.deepEqual(writes, []);
});

test("lookup normalizes existing question labels and rejects unknown levels in both layers", () => {
  for (const domain of [webDomain, backendDomain]) {
    for (const [input, result] of [[" Easy ", DifficultyLevel.EASY], ["MEDIUM", DifficultyLevel.MEDIUM], ["hard", DifficultyLevel.HARD]]) {
      assert.equal(domain.normalizeDifficultyLevel(input), result);
    }
    for (const input of [null, undefined, 1, "", "extreme"]) {
      assert.throws(() => domain.normalizeDifficultyLevel(input), /difficultyLevel/);
    }
  }
});

test("read and save failures remain visible without replacing the saved configuration", async () => {
  await saveReadinessConfig({difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS});
  readFailure = new Error("Could not read database");
  await assert.rejects(() => getReadinessConfig(), /Could not read database/);
  await assert.rejects(() => getDifficultyWeight(DifficultyLevel.EASY), /Could not read database/);
  writeFailure = new Error("Could not write database");
  await assert.rejects(() => saveReadinessConfig({difficultyWeights: {easy: 2, medium: 3, hard: 4}}), /Could not write database/);
  readFailure = null;
  assert.equal((await getReadinessConfig()).difficultyWeights.easy, 0.75);
});

test("backend and web feature APIs read and update the same Firestore configuration", async () => {
  await saveReadinessConfig({difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS});
  assert.equal((await backend.getReadinessConfig()).numberOfPractices, 5);
  assert.equal(await backend.getDifficultyWeight(backend.DifficultyLevel.HARD), 1.75);
  assert.equal(await backend.setReadinessPracticeCount(9, {updatedBy: "backend-admin"}), 9);
  assert.equal(await backend.setPreAssessmentWeight(2, {updatedBy: "backend-admin"}), 2);
  assert.equal(await backend.getReadinessPracticeCount(), 9);
  assert.equal(await backend.getPreAssessmentWeight(), 2);
  assert.equal(await getReadinessPracticeCount(), 9);
  assert.equal(await getPreAssessmentWeight(), 2);
  assert.equal((await getReadinessConfig()).updatedBy, "backend-admin");
  assert.deepEqual((await getReadinessConfig()).difficultyWeights, DEFAULT_DIFFICULTY_WEIGHTS);
  assert.ok(calls.every(({name}) => name === "isCurrentUserSiteAdmin"));
});

test("web saves require a verified administrator and ignore caller-supplied audit metadata", async () => {
  auth.currentUser = {uid: "visitor-1", email: "visitor@example.com", emailVerified: true};
  await assert.rejects(() => saveReadinessConfig({difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS, updatedBy: "admin-1"}), /not a site administrator/);
  await assert.rejects(() => setReadinessPracticeCount(8), /not a site administrator/);
  await assert.rejects(() => setPreAssessmentWeight(2), /not a site administrator/);
  auth.currentUser = {...adminUser, emailVerified: false};
  await assert.rejects(() => saveReadinessConfig({numberOfPractices: 8}), /Verify/);
  assert.deepEqual(writes, []);
  auth.currentUser = {...adminUser};
  const config = await saveReadinessConfig({numberOfPractices: 8, updatedBy: "spoofed", updatedAt: "2000-01-01"});
  assert.equal(config.updatedBy, "admin-1");
  assert.equal(config.updatedAt.toISOString(), updatedAt.toISOString());
});

test("unsigned web access and authentication changes during authorization cannot read or write", async () => {
  auth.currentUser = null;
  await assert.rejects(() => getReadinessConfig(), /No authenticated user/);
  await assert.rejects(() => saveReadinessConfig({numberOfPractices: 8}), /No authenticated user/);
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);
  auth.currentUser = {...adminUser};
  onAdminCheck = () => { auth.currentUser = {uid: "visitor-1", email: "visitor@example.com", emailVerified: true}; };
  await assert.rejects(() => saveReadinessConfig({numberOfPractices: 8}), /account changed/);
  assert.deepEqual(writes, []);
});

test("backend feature saves require trusted administrator context", async () => {
  await assert.rejects(() => backend.saveReadinessConfig({numberOfPractices: 8}), /administrator UID/);
  await assert.rejects(() => backend.setPreAssessmentWeight(2), /administrator UID/);
  assert.deepEqual(writes, []);
});
