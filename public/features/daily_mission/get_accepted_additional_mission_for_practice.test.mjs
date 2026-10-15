import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
import {GetAcceptedAdditionalMissionForPractice as WebUseCase} from "./application/get_accepted_additional_mission_for_practice.js";
import {FirestoreDailyMissionRepository as WebRepository} from "./infrastructure/firestore_daily_mission_repository.js";
import * as webModule from "./daily_mission_module.js";
import {studentDailyMissionSchema as webSchema} from "../../config/firebase/student_daily_mission_schema.js";

const require = createRequire(import.meta.url);
const {GetAcceptedAdditionalMissionForPractice: BackendUseCase} = require("../../../functions/features/daily_mission/application/get_accepted_additional_mission_for_practice.js");
const {FirestoreDailyMissionRepository: BackendRepository} = require("../../../functions/features/daily_mission/infrastructure/firestore_daily_mission_repository.js");
const backendModule = require("../../../functions/features/daily_mission/daily_mission_module.js");
const scope = {studentId: "student-1", practiceId: "practice-1"};
const route = {...scope, syllabusId: "math", topicId: "fractions", date: "2026-10-10"};
const context = {missionDate: route.date, syllabusId: route.syllabusId, topicId: route.topicId, practiceId: route.practiceId};
const studentPath = "studentDailyMissions/" + scope.studentId;
const lookupPath = studentPath + "/acceptedAdditionalMissionPractices/" + scope.practiceId;
const syllabusPath = studentPath + "/days/" + route.date + "/syllabuses/" + route.syllabusId;
const assignmentPath = "studentPractices/" + scope.studentId + "/assignedPractices/" + scope.practiceId;

function fixture(Repository, UseCase, web) {
  const documents = new Map();
  const versions = new Map();
  const reads = [];
  const queries = [];
  const writes = [];
  let readError = null;
  let commitError = null;
  const snapshot = path => ({exists: documents.has(path), data: () => documents.get(path)});
  const collectionIds = path => [...documents.keys()]
    .filter(key => key.startsWith(path + "/"))
    .map(key => key.slice(path.length + 1)).filter(id => !id.includes("/"));
  const operations = {
    getDocumentRef: (path, id) => ({path: path + "/" + id}),
    getFirestoreDb: () => ({
      async runTransaction(callback) {
        for (let attempt = 0; attempt < 20; attempt++) {
          const pending = [];
          const readVersions = new Map();
          const result = await callback({
            async get({path}) {
              assert.equal(pending.length, 0, "All transaction reads precede writes.");
              if (readError) throw readError;
              reads.push(path);
              readVersions.set(path, versions.get(path) || 0);
              return snapshot(path);
            },
            set({path}, data, options) {pending.push({path, data, options});},
          });
          if ([...readVersions].some(([path, version]) => (versions.get(path) || 0) !== version)) continue;
          if (commitError) throw commitError;
          for (const write of pending) {
            documents.set(write.path, write.options?.merge ? {...documents.get(write.path), ...write.data} : write.data);
            versions.set(write.path, (versions.get(write.path) || 0) + 1);
            writes.push(write);
          }
          return result;
        }
        throw new Error("Too many transaction retries");
      },
    }),
    async readDocument(path, id) {
      if (readError) throw readError;
      reads.push(path + "/" + id);
      return documents.get(path + "/" + id) ?? null;
    },
    async readCollectionIds(path) {
      if (readError) throw readError;
      queries.push(path);
      return collectionIds(path);
    },
    async readCollection(path) {
      if (readError) throw readError;
      queries.push(path);
      return collectionIds(path).map(id => ({...documents.get(path + "/" + id), id}));
    },
  };
  const repository = new Repository(web ? Object.fromEntries(Object.entries(operations).map(([name, value]) => [name + "Operation", value])) : operations);
  const useCase = new UseCase({dailyMissionRepository: repository});
  function seedMission(date = route.date, {studentId = scope.studentId, practiceId = scope.practiceId, syllabusId = route.syllabusId, topicId = route.topicId} = {}) {
    const path = "studentDailyMissions/" + studentId + "/days/" + date;
    documents.set(path, {});
    documents.set(path + "/syllabuses/" + syllabusId, {});
    documents.set(path + "/syllabuses/" + syllabusId + "/additionalTopics/" + topicId, {});
    documents.set(path + "/syllabuses/" + syllabusId + "/additionalTopics/" + topicId + "/practices/" + practiceId, {});
  }
  function seedUnlock(date = route.date, syllabusId = route.syllabusId) {
    const path = studentPath + "/days/" + date;
    documents.set(path, {});
    documents.set(path + "/syllabuses/" + syllabusId, {coreMission: {topicId: "core-topic", practiceId: "core-1"}});
    documents.set("studentPractices/" + scope.studentId + "/completedPractices/core-1", {});
  }
  function seedLookup(changes = {}) {
    documents.set(lookupPath, {missionDate: route.date, syllabusId: route.syllabusId, topicId: route.topicId, ...changes});
  }
  return {documents, reads, queries, writes, repository, useCase, seedMission, seedLookup, seedUnlock,
    setReadError: error => {readError = error;}, setCommitError: error => {commitError = error;}};
}

test("additional mission lookup is a backend/web feature API and has matching schemas", () => {
  assert.equal(typeof backendModule.getAcceptedAdditionalMissionForPractice, "function");
  assert.equal(typeof webModule.getAcceptedAdditionalMissionForPractice, "function");
  assert.deepEqual(webSchema, require("../../../functions/schema/student_daily_mission_schema.js").studentDailyMissionSchema);
  assert.equal(Object.hasOwn(require("../../../functions/index.js"), "getAcceptedAdditionalMissionForPractice"), false);
});

for (const [layer, Repository, UseCase, web] of [
  ["backend", BackendRepository, BackendUseCase, false], ["web", WebRepository, WebUseCase, true],
]) {
  test(layer + ": indexed additional lookup verifies the accepted practice in two reads", async () => {
    const f = fixture(Repository, UseCase, web); f.seedMission(); f.seedLookup();
    const result = await f.useCase.execute({...scope, missionDate: "2099-01-01", syllabusId: "spoofed"});
    assert.deepEqual(result, context);
    assert.ok(Object.isFrozen(result));
    assert.deepEqual(f.reads, [lookupPath, syllabusPath + "/additionalTopics/fractions/practices/practice-1"]);
    assert.deepEqual(f.queries, []);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": a lookup alone, a different topic and a different practice cannot establish acceptance", async () => {
    for (const changes of [null, {practiceId: "another"}, {topicId: "geometry"}]) {
      const f = fixture(Repository, UseCase, web); f.seedLookup();
      if (changes) f.seedMission(route.date, changes);
      assert.equal(await f.useCase.execute(scope), null);
      assert.deepEqual(f.writes, []);
    }
  });

  test(layer + ": legacy lookup uses the latest acceptance date without requiring completion", async () => {
    const f = fixture(Repository, UseCase, web);
    f.seedMission("2026-09-01"); f.seedMission("2026-09-05");
    f.seedMission("2026-09-06", {practiceId: "another"});
    assert.deepEqual(await f.useCase.execute(scope), {...context, missionDate: "2026-09-05"});
    assert.equal(f.documents.has(lookupPath), false);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": core missions, suggested practices and other students' missions are excluded", async () => {
    const f = fixture(Repository, UseCase, web);
    f.seedUnlock();
    f.documents.set(syllabusPath, {coreMission: {topicId: route.topicId, practiceId: scope.practiceId}});
    f.documents.set(assignmentPath, {});
    f.seedMission(route.date, {studentId: "other-student"});
    assert.equal(await f.useCase.execute(scope), null);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": malformed scope, stored dates and conflicting legacy routes fail", async () => {
    const f = fixture(Repository, UseCase, web);
    for (const input of [undefined, null, [], {}, {...scope, studentId: ""}, {...scope, practiceId: "bad/id"}]) {
      await assert.rejects(() => f.useCase.execute(input));
    }
    assert.deepEqual(f.reads, []);
    f.seedLookup({missionDate: "2026-02-30"});
    await assert.rejects(() => f.useCase.execute(scope), /calendar date/);
    f.documents.delete(lookupPath);
    f.seedMission(); f.seedMission(route.date, {topicId: "geometry"});
    await assert.rejects(() => f.useCase.execute(scope), /conflicting additional mission/);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": missing students return null and read failures propagate", async () => {
    const f = fixture(Repository, UseCase, web);
    assert.equal(await f.useCase.execute(scope), null);
    const error = new Error("Firestore unavailable"); f.setReadError(error);
    await assert.rejects(() => f.useCase.execute(scope), value => value === error);
  });

  test(layer + ": acceptance commits its lookup atomically and repeated acceptance writes nothing", async () => {
    const f = fixture(Repository, UseCase, web); f.seedUnlock();
    assert.deepEqual(await f.repository.acceptAdditionalMission(route), {created: true});
    assert.deepEqual(await f.useCase.execute(scope), context);
    const before = f.writes.length;
    assert.deepEqual(await f.repository.acceptAdditionalMission(route), {created: false});
    assert.equal(f.writes.length, before);
    assert.deepEqual(f.documents.get(lookupPath), {missionDate: route.date, syllabusId: route.syllabusId, topicId: route.topicId});
  });

  test(layer + ": repeating a legacy acceptance repairs only its lookup", async () => {
    const f = fixture(Repository, UseCase, web); f.seedMission();
    assert.deepEqual(await f.repository.acceptAdditionalMission(route), {created: false});
    assert.deepEqual(f.writes.map(write => write.path), [lookupPath]);
    assert.deepEqual(await f.useCase.execute(scope), context);
  });

  test(layer + ": concurrent dates preserve the newest lookup and older retries never downgrade it", async () => {
    const f = fixture(Repository, UseCase, web);
    f.seedUnlock(); f.seedUnlock("2026-10-09");
    const older = {...route, date: "2026-10-09"};
    await Promise.all([f.repository.acceptAdditionalMission(route), f.repository.acceptAdditionalMission(older)]);
    assert.deepEqual(await f.useCase.execute(scope), context);
    const before = f.writes.length;
    await f.repository.acceptAdditionalMission(older);
    assert.equal(f.writes.length, before);
  });

  test(layer + ": same-day conflicting lookup routes fail without writes", async () => {
    const f = fixture(Repository, UseCase, web); f.seedUnlock(); f.seedLookup({topicId: "other"});
    await assert.rejects(() => f.repository.acceptAdditionalMission(route), error => error.code === "failed-precondition");
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": failed unlock or commit leaves no additional acceptance or lookup", async () => {
    const f = fixture(Repository, UseCase, web);
    await assert.rejects(() => f.repository.acceptAdditionalMission(route), /Complete today's Daily Mission/);
    assert.deepEqual(f.writes, []);
    f.seedUnlock(); f.setCommitError(new Error("Commit failed"));
    await assert.rejects(() => f.repository.acceptAdditionalMission(route), /Commit failed/);
    assert.equal(f.documents.has(lookupPath), false);
    assert.equal(f.documents.has(syllabusPath + "/additionalTopics/fractions/practices/practice-1"), false);
    assert.deepEqual(f.writes, []);
  });
}

