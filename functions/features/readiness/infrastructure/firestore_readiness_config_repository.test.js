const assert = require("node:assert/strict");
const test = require("node:test");
const {FirestoreReadinessConfigRepository} = require("./firestore_readiness_config_repository");

const WEIGHTS = {easy: 0.75, medium: 1, hard: 1.75};
const COMMIT_TIME = new Date("2026-10-04T05:00:00.000Z");

function createHarness(initial = null) {
  let stored = initial;
  const reads = [];
  const writes = [];
  const repository = new FirestoreReadinessConfigRepository({
    async readDocument(collection, id) {
      reads.push({collection, id});
      return stored;
    },
    getDocumentRef(collection, id) {
      return {collection, id};
    },
    getFirestoreDb() {
      return {async runTransaction(operation) {
        return operation({
          async get() { return {exists: stored !== null, data: () => stored}; },
          set({collection, id}, data, options) {
            writes.push({collection, id, data, options});
            stored = {...data, updatedAt: {toDate: () => COMMIT_TIME}};
          },
        });
      }};
    },
    serverTimestamp: () => "server-timestamp",
  });
  return {repository, reads, writes};
}

test("missing configuration returns null without creating a default record", async () => {
  const {repository, reads, writes} = createHarness();
  assert.equal(await repository.get(), null);
  assert.deepEqual(reads, [{collection: "readinessConfigs", id: "default"}]);
  assert.deepEqual(writes, []);
});

test("saving replaces one current document with a server timestamp and no history", async () => {
  const {repository, reads, writes} = createHarness();
  const first = await repository.save({difficultyWeights: WEIGHTS, updatedBy: "admin-1"});
  assert.equal(first.updatedAt, COMMIT_TIME);
  assert.equal(first.updatedBy, "admin-1");
  assert.deepEqual(writes[0], {
    collection: "readinessConfigs",
    id: "default",
    data: {difficultyWeights: WEIGHTS, numberOfPractices: 5, preAssessmentWeight: 1, updatedAt: "server-timestamp", updatedBy: "admin-1"},
    options: {merge: false},
  });
  assert.deepEqual(reads, [{collection: "readinessConfigs", id: "default"}]);
  await repository.save({difficultyWeights: {...WEIGHTS, hard: 2}, updatedBy: "admin-2"});
  const latest = await repository.get();
  assert.equal(latest.difficultyWeights.hard, 2);
  assert.equal(latest.updatedBy, "admin-2");
  assert.deepEqual(Object.keys(latest).sort(), ["difficultyWeights", "numberOfPractices", "preAssessmentWeight", "updatedAt", "updatedBy"]);
  assert.deepEqual(writes.map(({collection, id}) => `${collection}/${id}`), [
    "readinessConfigs/default", "readinessConfigs/default",
  ]);
});

test("invalid weights and missing administrator context cannot write", async () => {
  const {repository, writes} = createHarness();
  await assert.rejects(() => repository.save({difficultyWeights: {...WEIGHTS, easy: 0}, updatedBy: "admin-1"}), /greater than zero/);
  await assert.rejects(() => repository.save({difficultyWeights: WEIGHTS}), /administrator UID/);
  assert.deepEqual(writes, []);
});

test("malformed stored configuration fails instead of inventing default weights", async () => {
  const {repository} = createHarness({
    difficultyWeights: {easy: 0.75, medium: 1},
    updatedAt: COMMIT_TIME,
    updatedBy: "admin-1",
  });
  await assert.rejects(() => repository.get(), /exactly easy, medium, and hard/);
});

test("database read and write failures propagate", async () => {
  const repository = new FirestoreReadinessConfigRepository({
    readDocument: async () => { throw new Error("read failed"); },
    getDocumentRef: () => ({set: async () => { throw new Error("write failed"); }}),
    getFirestoreDb: () => ({runTransaction: async () => { throw new Error("write failed"); }}),
    serverTimestamp: () => "server-timestamp",
  });
  await assert.rejects(() => repository.get(), /read failed/);
  await assert.rejects(() => repository.save({difficultyWeights: WEIGHTS, updatedBy: "admin-1"}), /write failed/);
});

test("legacy configuration reads the new defaults without writing", async () => {
  const {repository, writes} = createHarness({difficultyWeights: WEIGHTS, updatedAt: COMMIT_TIME, updatedBy: "admin-1"});
  const config = await repository.get();
  assert.equal(config.numberOfPractices, 5);
  assert.equal(config.preAssessmentWeight, 1);
  assert.deepEqual(writes, []);
});

test("partial updates preserve every setting omitted from the request", async () => {
  const {repository} = createHarness();
  await repository.save({difficultyWeights: WEIGHTS, numberOfPractices: 8, preAssessmentWeight: 1.5, updatedBy: "admin-1"});
  let config = await repository.save({numberOfPractices: 12, updatedBy: "admin-2"});
  assert.equal(config.numberOfPractices, 12);
  assert.equal(config.preAssessmentWeight, 1.5);
  assert.deepEqual(config.difficultyWeights, WEIGHTS);
  config = await repository.save({preAssessmentWeight: 2, updatedBy: "admin-2"});
  assert.equal(config.numberOfPractices, 12);
  assert.equal(config.preAssessmentWeight, 2);
  config = await repository.save({difficultyWeights: {...WEIGHTS, hard: 3}, updatedBy: "admin-1"});
  assert.equal(config.numberOfPractices, 12);
  assert.equal(config.preAssessmentWeight, 2);
  assert.equal(config.difficultyWeights.hard, 3);
});

test("each new setting can initialize the current configuration with defaults for other values", async () => {
  const {repository} = createHarness();
  const config = await repository.save({numberOfPractices: 7, updatedBy: "admin-1"});
  assert.equal(config.numberOfPractices, 7);
  assert.equal(config.preAssessmentWeight, 1);
  assert.deepEqual(config.difficultyWeights, WEIGHTS);
});

test("invalid new parameters cannot write a partial configuration", async () => {
  const {repository, writes} = createHarness();
  for (const numberOfPractices of [0, -1, 1.5, "5", null, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => repository.save({numberOfPractices, updatedBy: "admin-1"}), /positive integer/);
  }
  for (const preAssessmentWeight of [0, -1, NaN, Infinity, "1", null]) {
    await assert.rejects(() => repository.save({preAssessmentWeight, updatedBy: "admin-1"}), /greater than zero/);
  }
  assert.deepEqual(writes, []);
});
