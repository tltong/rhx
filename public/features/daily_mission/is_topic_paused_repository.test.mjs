import assert from "node:assert/strict";
import test from "node:test";

import {
  FirestoreDailyMissionRepository
} from "./infrastructure/firestore_daily_mission_repository.js";

const INPUT = Object.freeze({
  studentId: "student-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  currentDate: "2026-09-30"
});
const PAUSED_TOPICS_PATH = "studentDailyMissions/student-1/"
  + "pausedTopics/syllabus-1/topics";

function createRepository(pausedTopic = null) {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readDocumentOperation(collectionPath, documentId) {
      reads.push({collectionPath, documentId});
      return pausedTopic;
    }
  });

  return {reads, repository};
}

test("web repository returns false when no pause record exists", async () => {
  const {reads, repository} = createRepository();

  assert.equal(await repository.isTopicPaused(INPUT), false);
  assert.deepEqual(reads, [{
    collectionPath: PAUSED_TOPICS_PATH,
    documentId: "topic-1"
  }]);
});

test("web repository returns true through pause day 14", async () => {
  const {repository} = createRepository({pausedDate: "2026-09-16"});

  assert.equal(await repository.isTopicPaused(INPUT), true);
});

test("web repository returns false after day 14 without writing", async () => {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readDocumentOperation(collectionPath, documentId) {
      reads.push({collectionPath, documentId});
      return {pausedDate: "2026-09-15"};
    }
  });

  assert.equal(await repository.isTopicPaused(INPUT), false);
  assert.deepEqual(reads, [{
    collectionPath: PAUSED_TOPICS_PATH,
    documentId: "topic-1"
  }]);
});
