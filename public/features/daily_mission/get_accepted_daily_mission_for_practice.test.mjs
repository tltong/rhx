import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
import {GetAcceptedDailyMissionForPractice as WebUseCase} from "./application/get_accepted_daily_mission_for_practice.js";
import {FirestoreDailyMissionRepository as WebRepository} from "./infrastructure/firestore_daily_mission_repository.js";
import * as webModule from "./daily_mission_module.js";
import {studentDailyMissionSchema as webSchema} from "../../config/firebase/student_daily_mission_schema.js";

const require = createRequire(import.meta.url);
const {GetAcceptedDailyMissionForPractice: BackendUseCase} = require("../../../functions/features/daily_mission/application/get_accepted_daily_mission_for_practice.js");
const {FirestoreDailyMissionRepository: BackendRepository} = require("../../../functions/features/daily_mission/infrastructure/firestore_daily_mission_repository.js");
const backendModule = require("../../../functions/features/daily_mission/daily_mission_module.js");
const scope = {studentId: "student-1", practiceId: "practice-1"};
const route = {...scope, syllabusId: "math", topicId: "fractions", date: "2026-10-10"};
const context = {missionDate: route.date, syllabusId: route.syllabusId, topicId: route.topicId, practiceId: route.practiceId};
const studentPath = "studentDailyMissions/" + scope.studentId;
const lookupPath = studentPath + "/acceptedDailyMissionPractices/" + scope.practiceId;
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
    documents.set(path + "/syllabuses/" + syllabusId, {coreMission: {topicId, practiceId}});
  }
  function seedLookup(changes = {}) {
    documents.set(lookupPath, {missionDate: route.date, syllabusId: route.syllabusId, topicId: route.topicId, ...changes});
  }
  return {documents, reads, queries, writes, repository, useCase, seedMission, seedLookup,
    setReadError: error => {readError = error;}, setCommitError: error => {commitError = error;}};
}

test("accepted mission lookup is a backend and web feature API with matching schemas", () => {
  assert.equal(typeof backendModule.getAcceptedDailyMissionForPractice, "function");
  assert.equal(typeof webModule.getAcceptedDailyMissionForPractice, "function");
  assert.deepEqual(webSchema, require("../../../functions/schema/student_daily_mission_schema.js").studentDailyMissionSchema);
  assert.equal(Object.hasOwn(require("../../../functions/index.js"), "getAcceptedDailyMissionForPractice"), false);
});

for (const [layer, Repository, UseCase, web] of [
  ["backend", BackendRepository, BackendUseCase, false], ["web", WebRepository, WebUseCase, true],
]) {
  test(layer + ": indexed lookup verifies the core record in two reads and remains read-only", async () => {
    const f = fixture(Repository, UseCase, web);
    f.seedMission(); f.seedLookup();
    const result = await f.useCase.execute({...scope, missionDate: "2099-01-01", syllabusId: "spoofed"});
    assert.deepEqual(result, context);
    assert.ok(Object.isFrozen(result));
    assert.deepEqual(f.reads, [lookupPath, syllabusPath]);
    assert.deepEqual(f.queries, []);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": historical acceptance uses its original date and does not require practice completion", async () => {
    const f = fixture(Repository, UseCase, web);
    f.seedMission("2026-09-01"); f.seedLookup({missionDate: "2026-09-01"});
    assert.deepEqual(await f.useCase.execute(scope), {...context, missionDate: "2026-09-01"});
  });

  test(layer + ": a lookup alone cannot establish acceptance and mismatched references return null", async () => {
    for (const changes of [null, {practiceId: "another"}, {topicId: "geometry"}]) {
      const f = fixture(Repository, UseCase, web);
      f.seedLookup();
      if (changes) f.seedMission(route.date, changes);
      assert.equal(await f.useCase.execute(scope), null);
      assert.deepEqual(f.writes, []);
    }
  });

  test(layer + ": older missions without lookup remain readable, with the latest matching date selected", async () => {
    const f = fixture(Repository, UseCase, web);
    f.seedMission("2026-09-01"); f.seedMission("2026-09-05");
    f.seedMission("2026-09-06", {practiceId: "another"});
    assert.deepEqual(await f.useCase.execute(scope), {...context, missionDate: "2026-09-05"});
    assert.deepEqual(f.queries, [studentPath + "/days", studentPath + "/days/2026-09-06/syllabuses", studentPath + "/days/2026-09-05/syllabuses"]);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": additional missions, suggestions and another student's missions return null", async () => {
    const f = fixture(Repository, UseCase, web);
    f.documents.set(assignmentPath, {});
    f.documents.set(studentPath + "/days/" + route.date, {});
    f.documents.set(syllabusPath, {});
    f.documents.set(syllabusPath + "/additionalTopics/fractions/practices/" + scope.practiceId, {});
    f.seedMission(route.date, {studentId: "other-student"});
    assert.equal(await f.useCase.execute(scope), null);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": invalid scope and malformed stored routes fail rather than inventing mission context", async () => {
    const f = fixture(Repository, UseCase, web);
    for (const input of [undefined, null, [], {}, {...scope, studentId: ""}, {...scope, practiceId: "bad/id"}, {...scope, studentId: ".."}]) {
      await assert.rejects(() => f.useCase.execute(input));
    }
    assert.deepEqual(f.reads, []);
    f.seedLookup({missionDate: "2026-02-30"});
    await assert.rejects(() => f.useCase.execute(scope), /calendar date/);
    f.documents.delete(lookupPath);
    f.seedMission(route.date, {topicId: ""});
    await assert.rejects(() => f.useCase.execute(scope), /topicId/);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": missing students return null and read failures propagate", async () => {
    const f = fixture(Repository, UseCase, web);
    assert.equal(await f.useCase.execute(scope), null);
    const error = new Error("Firestore unavailable"); f.setReadError(error);
    await assert.rejects(() => f.useCase.execute(scope), value => value === error);
    assert.deepEqual(f.writes, []);
  });

  test(layer + ": accepting a mission atomically stores the lookup and repeated acceptance makes no writes", async () => {
    const f = fixture(Repository, UseCase, web); f.documents.set(assignmentPath, {});
    assert.deepEqual(await f.repository.acceptCoreMission(route), {created: true});
    assert.deepEqual(await f.useCase.execute(scope), context);
    const before = f.writes.length;
    assert.deepEqual(await f.repository.acceptCoreMission(route), {created: false});
    assert.equal(f.writes.length, before);
    assert.deepEqual(f.documents.get(lookupPath), {missionDate: route.date, syllabusId: route.syllabusId, topicId: route.topicId});
  });

  test(layer + ": reaccepting a legacy core mission repairs only its missing lookup", async () => {
    const f = fixture(Repository, UseCase, web); f.seedMission();
    assert.deepEqual(await f.repository.acceptCoreMission(route), {created: false});
    assert.deepEqual(f.writes.map(write => write.path), [lookupPath]);
    assert.deepEqual(await f.useCase.execute(scope), context);
  });

  test(layer + ": concurrent acceptance on different days preserves the latest lookup", async () => {
    const f = fixture(Repository, UseCase, web); f.documents.set(assignmentPath, {});
    const older = {...route, date: "2026-10-09"};
    await Promise.all([f.repository.acceptCoreMission(route), f.repository.acceptCoreMission(older)]);
    assert.deepEqual(await f.useCase.execute(scope), context);
    const before = f.writes.length;
    await f.repository.acceptCoreMission(older);
    assert.equal(f.writes.length, before);
    assert.deepEqual(await f.useCase.execute(scope), context);
  });

  test(layer + ": transaction failure or missing assignment leaves no lookup or accepted mission", async () => {
    const f = fixture(Repository, UseCase, web);
    await assert.rejects(() => f.repository.acceptCoreMission(route), /no longer assigned/);
    assert.equal(f.documents.has(lookupPath), false);
    f.documents.set(assignmentPath, {}); f.setCommitError(new Error("Commit failed"));
    await assert.rejects(() => f.repository.acceptCoreMission(route), /Commit failed/);
    assert.equal(f.documents.has(syllabusPath), false);
    assert.equal(f.documents.has(lookupPath), false);
    assert.deepEqual(f.writes, []);
  });
}
