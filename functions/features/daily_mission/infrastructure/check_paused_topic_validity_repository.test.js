const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

const INPUT = Object.freeze({
  studentId: "student-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  currentDate: "2026-09-27",
});
const PAUSED_TOPIC_PATH = "studentDailyMissions/student-1/"
  + "pausedTopics/syllabus-1/topics/topic-1";

function createRepository(pausedTopic = null) {
  const reads = [];
  const deletes = [];
  const transaction = {
    async get(reference) {
      reads.push(reference.path);

      return {
        exists: pausedTopic !== null,
        data() {
          return pausedTopic;
        },
      };
    },
    delete(reference) {
      deletes.push(reference.path);
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

  return {deletes, reads, repository};
}

test("missing paused topic is reported without a deletion", async () => {
  const {deletes, reads, repository} = createRepository();

  assert.deepEqual(
    await repository.checkPausedTopicValidity(INPUT),
    {
      pausedDate: null,
      isPaused: false,
      unpaused: false,
    },
  );
  assert.deepEqual(reads, [PAUSED_TOPIC_PATH]);
  assert.deepEqual(deletes, []);
});

test("paused topic remains paused on day 14", async () => {
  const {deletes, repository} = createRepository({
    pausedDate: "2026-09-13",
  });

  assert.deepEqual(
    await repository.checkPausedTopicValidity(INPUT),
    {
      pausedDate: "2026-09-13",
      isPaused: true,
      unpaused: false,
    },
  );
  assert.deepEqual(deletes, []);
});

test("paused topic is deleted after day 14", async () => {
  const {deletes, repository} = createRepository({
    pausedDate: "2026-09-12",
  });

  assert.deepEqual(
    await repository.checkPausedTopicValidity(INPUT),
    {
      pausedDate: "2026-09-12",
      isPaused: false,
      unpaused: true,
    },
  );
  assert.deepEqual(deletes, [PAUSED_TOPIC_PATH]);
});
