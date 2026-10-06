import assert from "node:assert/strict";
import test from "node:test";

import {
  FirestoreDailyMissionRepository
} from "./infrastructure/firestore_daily_mission_repository.js";

const ROUTE = Object.freeze({
  studentId: "student-1",
  syllabusId: "syllabus-1",
  topicId: "topic-1",
  practiceId: "practice-1",
  date: "2026-09-27"
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
    + "syllabus-1/topics/topic-1"
});

function snapshot(data = null) {
  return {
    exists: data !== null,
    data() {
      return data;
    }
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

test("web acceptCoreMission atomically writes the accepted path and stats", async () => {
  const {reads, repository, writes} = createRepository({
    [PATHS.assignedPractice]: {}
  });

  assert.deepEqual(await repository.acceptCoreMission(ROUTE), {
    created: true
  });
  assert.deepEqual(reads, [
    PATHS.syllabus,
    PATHS.assignedPractice,
    PATHS.pausedTopic
  ]);
  assert.deepEqual(writes.map(({path}) => path), [
    PATHS.student,
    PATHS.day,
    PATHS.syllabus,
    PATHS.coreTopic,
    PATHS.corePractice,
    PATHS.statsSyllabus,
    PATHS.statsTopic
  ]);
  assert.deepEqual(writes[2].data, {
    coreMission: {
      topicId: "topic-1",
      practiceId: "practice-1"
    }
  });
  assert.deepEqual(writes[6].data, {
    lastAcceptedDate: "2026-09-27"
  });
});

test("web acceptCoreMission is idempotent for the same mission", async () => {
  const {reads, repository, writes} = createRepository({
    [PATHS.syllabus]: {
      coreMission: {
        topicId: "topic-1",
        practiceId: "practice-1"
      }
    }
  });

  assert.deepEqual(await repository.acceptCoreMission(ROUTE), {
    created: false
  });
  assert.deepEqual(reads, [PATHS.syllabus]);
  assert.deepEqual(writes, []);
});

test("web acceptCoreMission rechecks paused-topic state", async () => {
  const {repository, writes} = createRepository({
    [PATHS.assignedPractice]: {},
    [PATHS.pausedTopic]: {pausedDate: "2026-09-27"}
  });

  await assert.rejects(
    () => repository.acceptCoreMission(ROUTE),
    (error) => (
      error.code === "failed-precondition"
      && /is paused/.test(error.message)
    )
  );
  assert.deepEqual(writes, []);
});
