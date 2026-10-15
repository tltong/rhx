const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

const ROUTE = Object.freeze({
  studentId: "student-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  practiceId: "practice-1",
  date: "2026-09-27",
});

const PATHS = Object.freeze({
  student: "studentDailyMissions/student-1",
  day: "studentDailyMissions/student-1/days/2026-09-27",
  syllabus: "studentDailyMissions/student-1/days/2026-09-27/"
    + "syllabuses/syllabus-1",
  coreTopic: "studentDailyMissions/student-1/days/2026-09-27/"
    + "syllabuses/syllabus-1/coreTopics/topic-1",
  corePractice: "studentDailyMissions/student-1/days/2026-09-27/"
    + "syllabuses/syllabus-1/coreTopics/topic-1/practices/practice-1",
  statsSyllabus: "studentDailyMissions/student-1/missionStats/syllabus-1",
  statsTopic: "studentDailyMissions/student-1/missionStats/"
    + "syllabus-1/topics/topic-1",
  assignedPractice: "studentPractices/student-1/"
    + "assignedPractices/practice-1",
  pausedTopic: "studentDailyMissions/student-1/pausedTopics/"
    + "syllabus-1/topics/topic-1",
  lookup: "studentDailyMissions/student-1/acceptedDailyMissionPractices/practice-1",
});

function snapshot(data = null) {
  return {
    exists: data !== null,
    data() {
      return data;
    },
  };
}

function createRepository(initialDocuments = {}) {
  const reads = [];
  const writes = [];
  const documents = new Map(Object.entries(initialDocuments));
  const transaction = {
    async get(reference) {
      reads.push(reference.path);
      return snapshot(documents.get(reference.path) ?? null);
    },
    set(reference, data, options) {
      writes.push({
        path: reference.path,
        data,
        options,
      });
    },
  };
  const repository = new FirestoreDailyMissionRepository({
    getDocumentRef(collectionPath, documentId) {
      return {path: `${collectionPath}/${documentId}`};
    },
    getFirestoreDb() {
      return {
        async runTransaction(operation) {
          return operation(transaction);
        },
      };
    },
  });

  return {reads, repository, writes};
}

test("acceptCoreMission atomically writes the accepted path and stats", async () => {
  const {reads, repository, writes} = createRepository({
    [PATHS.assignedPractice]: {},
  });

  assert.deepEqual(await repository.acceptCoreMission(ROUTE), {
    created: true,
  });
  assert.deepEqual(reads, [
    PATHS.syllabus,
    PATHS.lookup,
    PATHS.assignedPractice,
    PATHS.pausedTopic,
  ]);
  assert.deepEqual(writes, [
    {path: PATHS.student, data: {}, options: {merge: true}},
    {path: PATHS.day, data: {}, options: {merge: true}},
    {
      path: PATHS.syllabus,
      data: {
        coreMission: {
          topicId: "topic-1",
          practiceId: "practice-1",
        },
      },
      options: {merge: true},
    },
    {path: PATHS.coreTopic, data: {}, options: {merge: true}},
    {path: PATHS.corePractice, data: {}, options: undefined},
    {
      path: PATHS.lookup,
      data: {missionDate: "2026-09-27", syllabusId: "syllabus-1", topicId: "topic-1"},
      options: undefined,
    },
    {
      path: PATHS.statsSyllabus,
      data: {},
      options: {merge: true},
    },
    {
      path: PATHS.statsTopic,
      data: {lastAcceptedDate: "2026-09-27"},
      options: {merge: true},
    },
  ]);
});

test("acceptCoreMission is idempotent for the same daily mission", async () => {
  const {reads, repository, writes} = createRepository({
    [PATHS.lookup]: {missionDate: "2026-09-27", syllabusId: "syllabus-1", topicId: "topic-1"},
    [PATHS.syllabus]: {
      coreMission: {
        topicId: "topic-1",
        practiceId: "practice-1",
      },
    },
  });

  assert.deepEqual(await repository.acceptCoreMission(ROUTE), {
    created: false,
  });
  assert.deepEqual(reads, [PATHS.syllabus, PATHS.lookup]);
  assert.deepEqual(writes, []);
});

test("acceptCoreMission rejects a different mission in the daily slot", async () => {
  const {repository, writes} = createRepository({
    [PATHS.syllabus]: {
      coreMission: {
        topicId: "topic-2",
        practiceId: "practice-2",
      },
    },
  });

  await assert.rejects(
    () => repository.acceptCoreMission(ROUTE),
    (error) => error.code === "failed-precondition",
  );
  assert.deepEqual(writes, []);
});

test("acceptCoreMission rechecks assignment and paused-topic state", async (context) => {
  await context.test("practice must remain assigned", async () => {
    const {repository, writes} = createRepository();

    await assert.rejects(
      () => repository.acceptCoreMission(ROUTE),
      (error) => (
        error.code === "failed-precondition"
        && /no longer assigned/.test(error.message)
      ),
    );
    assert.deepEqual(writes, []);
  });

  await context.test("topic must remain active", async () => {
    const {repository, writes} = createRepository({
      [PATHS.assignedPractice]: {},
      [PATHS.pausedTopic]: {pausedDate: "2026-09-27"},
    });

    await assert.rejects(
      () => repository.acceptCoreMission(ROUTE),
      (error) => (
        error.code === "failed-precondition"
        && /is paused/.test(error.message)
      ),
    );
    assert.deepEqual(writes, []);
  });
});
