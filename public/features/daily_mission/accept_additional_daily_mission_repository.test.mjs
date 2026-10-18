import assert from "node:assert/strict";
import test from "node:test";

import {
  FirestoreDailyMissionRepository
} from "./infrastructure/firestore_daily_mission_repository.js";

const INPUT = Object.freeze({
  studentId: "student-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  practiceId: "practice-1",
  date: "2026-09-27"
});

const PATHS = Object.freeze({
  reset: "studentPracticeResets/student-1",
  assigned: "studentPractices/student-1/assignedPractices/practice-1",
  paused: "studentDailyMissions/student-1/pausedTopics/syllabus-1/topics/topic-1",
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
  completedCore: "studentPractices/student-1/completedPractices/core-1"
});

function createRepository({practiceExists = false, topicExists = false} = {}) {
  const reads = [];
  const writes = [];
  const transaction = {
    async get(reference) {
      reads.push(reference.path);
      if (reference.path === PATHS.assigned) return {exists: true, data: () => ({})};
      if (reference.path === PATHS.paused) return {exists: false, data: () => null};
      if (reference.path === PATHS.reset) return {exists: false, data: () => null};
      if (reference.path === PATHS.lookup) {
        return {exists: practiceExists, data: () => ({missionDate: INPUT.date, syllabusId: INPUT.syllabusId, topicId: INPUT.topicId})};
      }
      if (reference.path === PATHS.syllabus) {
        return {
          exists: true,
          data: () => ({coreMission: {topicId: "topic-core", practiceId: "core-1"}})
        };
      }
      if (reference.path === PATHS.completedCore) {
        return {exists: true};
      }
      return {
        exists: reference.path === PATHS.practice
          ? practiceExists
          : topicExists
      };
    },
    set(reference, data, options) {
      writes.push({path: reference.path, data, options});
    }
  };
  const repository = new FirestoreDailyMissionRepository({
    getDocumentRefOperation(collectionPath, documentId) {
      return {path: `${collectionPath}/${documentId}`};
    },
    getFirestoreDbOperation() {
      return {
        async runTransaction(operation) {
          return operation(transaction);
        }
      };
    }
  });

  return {reads, repository, writes};
}

test("web acceptAdditionalMission writes the additional hierarchy", async () => {
  const {reads, repository, writes} = createRepository();

  assert.deepEqual(await repository.acceptAdditionalMission(INPUT), {
    created: true
  });
  assert.deepEqual(reads, [PATHS.reset, PATHS.practice, PATHS.lookup, PATHS.topic, PATHS.syllabus, PATHS.completedCore, PATHS.assigned, PATHS.paused]);
  assert.deepEqual(writes, [
    {path: PATHS.student, data: {}, options: {merge: true}},
    {path: PATHS.day, data: {}, options: {merge: true}},
    {path: PATHS.syllabus, data: {}, options: {merge: true}},
    {path: PATHS.topic, data: {}, options: {merge: true}},
    {path: PATHS.practice, data: {}, options: undefined},
    {path: PATHS.lookup, data: {missionDate: INPUT.date, syllabusId: INPUT.syllabusId, topicId: INPUT.topicId}, options: undefined}
  ]);
});

test("web acceptAdditionalMission is idempotent for the same day", async () => {
  const {reads, repository, writes} = createRepository({
    practiceExists: true,
    topicExists: true
  });

  assert.deepEqual(await repository.acceptAdditionalMission(INPUT), {
    created: false
  });
  assert.deepEqual(reads, [PATHS.reset, PATHS.practice, PATHS.lookup]);
  assert.deepEqual(writes, []);
});

test("web acceptAdditionalMission rejects another practice for the topic", async () => {
  const {reads, repository, writes} = createRepository({topicExists: true});

  await assert.rejects(
    () => repository.acceptAdditionalMission(INPUT),
    (error) => (
      error.code === "failed-precondition"
      && /topic topic-1/.test(error.message)
    )
  );
  assert.deepEqual(reads, [PATHS.reset, PATHS.practice, PATHS.lookup, PATHS.topic]);
  assert.deepEqual(writes, []);
});
