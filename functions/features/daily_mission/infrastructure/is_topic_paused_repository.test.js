const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

const INPUT = Object.freeze({
  studentId: "student-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  currentDate: "2026-09-30",
});
const PAUSED_TOPICS_PATH = "studentDailyMissions/student-1/"
  + "pausedTopics/syllabus-1/topics";

function createRepository(pausedTopic = null) {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async deleteDocument() {
      throw new Error("isTopicPaused must not delete documents");
    },
    async readDocument(collectionPath, documentId) {
      reads.push({collectionPath, documentId});
      return pausedTopic;
    },
  });

  return {reads, repository};
}

test("returns false when the topic has no pause record", async () => {
  const {reads, repository} = createRepository();

  assert.equal(await repository.isTopicPaused(INPUT), false);
  assert.deepEqual(reads, [{
    collectionPath: PAUSED_TOPICS_PATH,
    documentId: "topic-1",
  }]);
});

test("returns true while the pause remains valid on day 14", async () => {
  const {repository} = createRepository({pausedDate: "2026-09-16"});

  assert.equal(await repository.isTopicPaused(INPUT), true);
});

test("returns false after day 14 without deleting the record", async () => {
  let deleteCalled = false;
  const repository = new FirestoreDailyMissionRepository({
    async deleteDocument() {
      deleteCalled = true;
    },
    async readDocument() {
      return {pausedDate: "2026-09-15"};
    },
  });

  assert.equal(await repository.isTopicPaused(INPUT), false);
  assert.equal(deleteCalled, false);
});
