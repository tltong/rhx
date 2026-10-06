import assert from "node:assert/strict";
import test from "node:test";

import {
  ListAdditionalMissionPracticeIds as WebListAdditionalMissions
} from "./application/list_additional_mission_practice_ids.js";
import {
  FirestoreDailyMissionRepository as WebRepository
} from "./infrastructure/firestore_daily_mission_repository.js";
import serverListing from "../../../functions/features/daily_mission/application/list_additional_mission_practice_ids.js";
import serverRepository from "../../../functions/features/daily_mission/infrastructure/firestore_daily_mission_repository.js";

function createScenario(Repository, ListAdditionalMissions, web) {
  const documents = new Map();
  const practices = new Map([
    ["daily-fractions", {syllabusId: "math", topicId: "fractions"}],
    ["fractions-1", {syllabusId: "math", topicId: "fractions"}],
    ["fractions-2", {syllabusId: "math", topicId: "fractions"}],
    ["geometry-1", {syllabusId: "math", topicId: "geometry"}],
    ["geometry-2", {syllabusId: "math", topicId: "geometry"}],
    ["algebra-1", {syllabusId: "math", topicId: "algebra"}],
    ["algebra-2", {syllabusId: "math", topicId: "algebra"}],
    ["science-1", {syllabusId: "science", topicId: "physics"}]
  ]);
  const studentId = "student-1";
  let date = "2026-10-04";
  const completedPath = (practiceId) => (
    `studentPractices/${studentId}/completedPractices/${practiceId}`
  );
  const idsInCollection = (collectionPath) => [...documents.keys()]
    .filter((path) => path.startsWith(`${collectionPath}/`))
    .map((path) => path.slice(collectionPath.length + 1))
    .filter((id) => !id.includes("/"));
  const operations = {
    getDocumentRef(collectionPath, id) {
      return {path: `${collectionPath}/${id}`};
    },
    getFirestoreDb() {
      return {
        async runTransaction(operation) {
          const pendingWrites = [];
          const result = await operation({
            async get({path}) {
              return {
                exists: documents.has(path),
                data: () => documents.get(path)
              };
            },
            set({path}, data, options) {
              pendingWrites.push({path, data, options});
            }
          });
          pendingWrites.forEach(({path, data, options}) => {
            documents.set(path, options?.merge
              ? {...documents.get(path), ...data}
              : data);
          });
          return result;
        }
      };
    },
    async readDocument(collectionPath, id) {
      return documents.get(`${collectionPath}/${id}`) ?? null;
    },
    async readCollectionIds(collectionPath) {
      return idsInCollection(collectionPath);
    },
    async readCollection(collectionPath) {
      return idsInCollection(collectionPath).map((id) => ({
        id,
        ...documents.get(`${collectionPath}/${id}`)
      }));
    }
  };
  practices.forEach((_, id) => {
    documents.set(`studentPractices/${studentId}/assignedPractices/${id}`, {});
  });
  const repository = new Repository(web
    ? Object.fromEntries(Object.entries(operations).map(([name, operation]) => [
      `${name}Operation`, operation
    ]))
    : operations);
  const listing = new ListAdditionalMissions({
    dailyMissionRepository: repository,
    async listAssignedPracticeIds() {
      return [...practices.keys()];
    },
    async getPracticeById(practiceId) {
      const route = practices.get(practiceId);
      return route ? {questions: [{...route, questionId: "question-1"}]} : null;
    },
    async checkPausedTopicValidity() {
      throw new Error("No topics are paused in this scenario.");
    },
    getCurrentDate: () => date
  });

  return {
    documents,
    practices,
    repository,
    route(practiceId) {
      return {studentId, ...practices.get(practiceId), practiceId, date};
    },
    list(syllabusId = "math") {
      return listing.execute({studentId, syllabusId});
    },
    complete(practiceId) {
      documents.set(completedPath(practiceId), {dateCompleted: date});
    },
    nextDay() {
      date = "2026-10-05";
    }
  };
}

for (const [name, Repository, Listing, web] of [
  ["web", WebRepository, WebListAdditionalMissions, true],
  ["server", serverRepository.FirestoreDailyMissionRepository,
    serverListing.ListAdditionalMissionPracticeIds, false]
]) {
  test(`${name}: additional missions require today's accepted subject mission to be complete`, async () => {
    const scenario = createScenario(Repository, Listing, web);
    const route = scenario.route("geometry-1");
    const assertLocked = async () => {
      const before = [...scenario.documents];
      assert.deepEqual(await scenario.list(), []);
      await assert.rejects(() => scenario.repository.acceptAdditionalMission(route), {
        code: "failed-precondition",
        message: "Complete today's Daily Mission for this subject first."
      });
      assert.deepEqual([...scenario.documents], before);
    };

    await assertLocked();
    await scenario.repository.acceptCoreMission(scenario.route("daily-fractions"));
    await assertLocked();
    scenario.complete("daily-fractions");
    const missions = await scenario.list();
    assert.equal(missions.length, 3);
    assert.deepEqual(new Set(missions.map((id) => scenario.practices.get(id).topicId)),
      new Set(["fractions", "geometry", "algebra"]));
    assert.equal(missions.includes("daily-fractions"), false);
    assert.deepEqual(await scenario.list(), missions);
    await assert.rejects(() => scenario.repository.acceptAdditionalMission(
      scenario.route("daily-fractions")
    ), {code: "failed-precondition"});
    assert.deepEqual(await scenario.repository.acceptAdditionalMission(route), {created: true});
  });

  test(`${name}: one daily mission per subject and one additional mission per topic`, async () => {
    const scenario = createScenario(Repository, Listing, web);
    await scenario.repository.acceptCoreMission(scenario.route("daily-fractions"));
    scenario.complete("daily-fractions");
    await assert.rejects(() => scenario.repository.acceptCoreMission(
      scenario.route("geometry-1")
    ), {code: "failed-precondition"});

    const missions = await scenario.list();
    const selected = missions.find((id) => scenario.practices.get(id).topicId === "geometry");
    const another = selected === "geometry-1" ? "geometry-2" : "geometry-1";
    assert.deepEqual(await scenario.repository.acceptAdditionalMission(scenario.route(selected)),
      {created: true});
    assert.deepEqual(await scenario.repository.acceptAdditionalMission(scenario.route(selected)),
      {created: false});
    await assert.rejects(() => scenario.repository.acceptAdditionalMission(scenario.route(another)),
      {code: "failed-precondition"});
    const remaining = await scenario.list();
    assert.equal(remaining.length, 2);
    assert.equal(remaining.some((id) => scenario.practices.get(id).topicId === "geometry"), false);
    for (const practiceId of remaining) {
      await scenario.repository.acceptAdditionalMission(scenario.route(practiceId));
    }
    assert.deepEqual(await scenario.list(), []);
  });

  test(`${name}: completing one subject does not unlock another subject`, async () => {
    const scenario = createScenario(Repository, Listing, web);
    await scenario.repository.acceptCoreMission(scenario.route("daily-fractions"));
    scenario.complete("daily-fractions");
    assert.equal((await scenario.list()).length, 3);
    assert.deepEqual(await scenario.list("science"), []);
    await assert.rejects(() => scenario.repository.acceptAdditionalMission(
      scenario.route("science-1")
    ), {code: "failed-precondition"});
  });

  test(`${name}: the next day requires a new daily mission and resets topic allowances`, async () => {
    const scenario = createScenario(Repository, Listing, web);
    await scenario.repository.acceptCoreMission(scenario.route("daily-fractions"));
    scenario.complete("daily-fractions");
    const selected = (await scenario.list()).find((id) => (
      scenario.practices.get(id).topicId === "geometry"
    ));
    await scenario.repository.acceptAdditionalMission(scenario.route(selected));
    assert.equal((await scenario.list()).length, 2);

    scenario.nextDay();
    assert.deepEqual(await scenario.list(), []);
    await assert.rejects(() => scenario.repository.acceptAdditionalMission(
      scenario.route("algebra-1")
    ), {code: "failed-precondition"});
    await scenario.repository.acceptCoreMission(scenario.route("algebra-1"));
    assert.deepEqual(await scenario.list(), []);
    scenario.complete("algebra-1");
    const nextDayMissions = await scenario.list();
    assert.equal(nextDayMissions.length, 3);
    assert.equal(nextDayMissions.some((id) => scenario.practices.get(id).topicId === "geometry"), true);
    assert.equal(nextDayMissions.includes("algebra-1"), false);
  });
}
