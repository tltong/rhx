const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

const INPUT = Object.freeze({
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
  topic: "studentDailyMissions/student-1/days/2026-09-27/"
    + "syllabuses/syllabus-1/additionalTopics/topic-1",
  practice: "studentDailyMissions/student-1/days/2026-09-27/"
    + "syllabuses/syllabus-1/additionalTopics/topic-1/"
    + "practices/practice-1",
  lookup: "studentDailyMissions/student-1/acceptedAdditionalMissionPractices/practice-1",
  completedCore: "studentPractices/student-1/completedPractices/core-1",
});

function createRepository({practiceExists = false, topicExists = false} = {}) {
  const reads = [];
  const writes = [];
  const transaction = {
    async get(reference) {
      reads.push(reference.path);
      if (reference.path === PATHS.lookup) {
        return {exists: practiceExists, data: () => ({missionDate: INPUT.date, syllabusId: INPUT.syllabusId, topicId: INPUT.topicId})};
      }
      if (reference.path === PATHS.syllabus) {
        return {
          exists: true,
          data: () => ({coreMission: {topicId: "topic-core", practiceId: "core-1"}}),
        };
      }
      if (reference.path === PATHS.completedCore) {
        return {exists: true};
      }
      return {
        exists: reference.path === PATHS.practice
          ? practiceExists
          : topicExists,
      };
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

test("acceptAdditionalMission atomically writes the additional mission hierarchy and lookup", async () => {
  const {reads, repository, writes} = createRepository();

  assert.deepEqual(await repository.acceptAdditionalMission(INPUT), {
    created: true,
  });
  assert.deepEqual(reads, [PATHS.practice, PATHS.lookup, PATHS.topic, PATHS.syllabus, PATHS.completedCore]);
  assert.deepEqual(writes, [
    {path: PATHS.student, data: {}, options: {merge: true}},
    {path: PATHS.day, data: {}, options: {merge: true}},
    {path: PATHS.syllabus, data: {}, options: {merge: true}},
    {path: PATHS.topic, data: {}, options: {merge: true}},
    {path: PATHS.practice, data: {}, options: undefined},
    {path: PATHS.lookup, data: {missionDate: INPUT.date, syllabusId: INPUT.syllabusId, topicId: INPUT.topicId}, options: undefined},
  ]);
});

test("acceptAdditionalMission is idempotent for the same day", async () => {
  const {reads, repository, writes} = createRepository({
    practiceExists: true,
    topicExists: true,
  });

  assert.deepEqual(await repository.acceptAdditionalMission(INPUT), {
    created: false,
  });
  assert.deepEqual(reads, [PATHS.practice, PATHS.lookup]);
  assert.deepEqual(writes, []);
});

test("acceptAdditionalMission rejects another practice for today's topic", async () => {
  const {reads, repository, writes} = createRepository({
    topicExists: true,
  });

  await assert.rejects(
    () => repository.acceptAdditionalMission(INPUT),
    (error) => (
      error.code === "failed-precondition"
      && /topic topic-1/.test(error.message)
    ),
  );
  assert.deepEqual(reads, [PATHS.practice, PATHS.lookup, PATHS.topic]);
  assert.deepEqual(writes, []);
});
