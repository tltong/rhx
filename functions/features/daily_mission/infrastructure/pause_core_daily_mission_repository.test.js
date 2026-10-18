const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

const INPUT = Object.freeze({
  studentId: "student-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  pausedDate: "2026-09-27",
});

const PATHS = Object.freeze({
  reset: "studentPracticeResets/student-1",
  student: "studentDailyMissions/student-1",
  pausedSyllabus: "studentDailyMissions/student-1/"
    + "pausedTopics/syllabus-1",
  pausedTopic: "studentDailyMissions/student-1/"
    + "pausedTopics/syllabus-1/topics/topic-1",
});

function createRepository(existingTopic = null) {
  const reads = [];
  const writes = [];
  const transaction = {
    async get(reference) {
      reads.push(reference.path);
      if (reference.path === PATHS.reset) return {exists: false, data: () => null};

      return {
        exists: existingTopic !== null,
        data() {
          return existingTopic;
        },
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

test("pauseTopic creates only the topic pause hierarchy", async () => {
  const {reads, repository, writes} = createRepository();

  assert.deepEqual(await repository.pauseTopic(INPUT), {
    pausedDate: "2026-09-27",
    created: true,
  });
  assert.deepEqual(reads, [PATHS.reset, PATHS.pausedTopic]);
  assert.deepEqual(writes, [
    {
      path: PATHS.student,
      data: {},
      options: {merge: true},
    },
    {
      path: PATHS.pausedSyllabus,
      data: {},
      options: {merge: true},
    },
    {
      path: PATHS.pausedTopic,
      data: {pausedDate: "2026-09-27"},
      options: undefined,
    },
  ]);
});

test("pauseTopic preserves the first paused date on retry", async () => {
  const {reads, repository, writes} = createRepository({
    pausedDate: "2026-09-20",
  });

  assert.deepEqual(await repository.pauseTopic(INPUT), {
    pausedDate: "2026-09-20",
    created: false,
  });
  assert.deepEqual(reads, [PATHS.reset, PATHS.pausedTopic]);
  assert.deepEqual(writes, []);
});
