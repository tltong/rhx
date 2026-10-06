import assert from "node:assert/strict";
import test from "node:test";

import {
  FirestoreDailyMissionRepository
} from "./infrastructure/firestore_daily_mission_repository.js";

test("web repository reads today's accepted core mission", async () => {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readDocumentOperation(collectionPath, documentId) {
      reads.push({collectionPath, documentId});
      return {
        coreMission: {
          topicId: "topic-1",
          practiceId: "practice-1"
        }
      };
    }
  });

  assert.deepEqual(await repository.getCoreMission({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    date: "2026-09-27"
  }), {
    topicId: "topic-1",
    practiceId: "practice-1"
  });
  assert.deepEqual(reads, [{
    collectionPath: "studentDailyMissions/student-1/days/2026-09-27/"
      + "syllabuses",
    documentId: "syllabus-1"
  }]);
});

test("web repository reads and sorts paused topic IDs", async () => {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readCollectionIdsOperation(collectionPath) {
      reads.push(collectionPath);
      return ["topic-2", "topic-1"];
    }
  });

  assert.deepEqual(await repository.listPausedTopicIds({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), ["topic-1", "topic-2"]);
  assert.deepEqual(reads, [
    "studentDailyMissions/student-1/pausedTopics/syllabus-1/topics"
  ]);
});

test("web repository reads and sorts core topic statistics", async () => {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readCollectionOperation(collectionPath) {
      reads.push(collectionPath);
      return [
        {id: "topic-2", lastAcceptedDate: "2026-09-20"},
        {id: "topic-1", lastAcceptedDate: "2026-09-10"}
      ];
    }
  });

  assert.deepEqual(await repository.listTopicStats({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), [
    {topicId: "topic-1", lastAcceptedDate: "2026-09-10"},
    {topicId: "topic-2", lastAcceptedDate: "2026-09-20"}
  ]);
  assert.deepEqual(reads, [
    "studentDailyMissions/student-1/missionStats/syllabus-1/topics"
  ]);
});

test("web repository reads additional topics accepted today", async () => {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readCollectionIdsOperation(collectionPath) {
      reads.push(collectionPath);
      return ["topic-2", "topic-1"];
    }
  });

  assert.deepEqual(await repository.listAcceptedAdditionalTopicIds({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    date: "2026-09-27"
  }), ["topic-1", "topic-2"]);
  assert.deepEqual(reads, [
    "studentDailyMissions/student-1/days/2026-09-27/"
      + "syllabuses/syllabus-1/additionalTopics"
  ]);
});

test("web repository finds additional practices accepted today", async () => {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readDocumentsOperation(documents, options) {
      reads.push({documents, options});
      return [null, {}];
    }
  });

  assert.deepEqual(await repository.listAcceptedAdditionalPracticeIds({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    date: "2026-09-27",
    candidates: [
      {topicId: "topic-1", practiceId: "practice-1"},
      {topicId: "topic-2", practiceId: "practice-2"}
    ]
  }), ["practice-2"]);
  assert.deepEqual(reads, [{
    documents: [
      {
        collectionPath: "studentDailyMissions/student-1/days/2026-09-27/"
          + "syllabuses/syllabus-1/additionalTopics/topic-1/practices",
        documentId: "practice-1"
      },
      {
        collectionPath: "studentDailyMissions/student-1/days/2026-09-27/"
          + "syllabuses/syllabus-1/additionalTopics/topic-2/practices",
        documentId: "practice-2"
      }
    ],
    options: {includeId: false}
  }]);
});

test("web repository deletes an expired paused topic during selection", async () => {
  const deleted = [];
  const reference = {
    path: "studentDailyMissions/student-1/pausedTopics/syllabus-1/"
      + "topics/topic-1"
  };
  const repository = new FirestoreDailyMissionRepository({
    getDocumentRefOperation(collectionPath, documentId) {
      assert.equal(`${collectionPath}/${documentId}`, reference.path);
      return reference;
    },
    getFirestoreDbOperation() {
      return {
        async runTransaction(operation) {
          return operation({
            async get(documentReference) {
              assert.equal(documentReference, reference);
              return {
                exists: true,
                data() {
                  return {pausedDate: "2026-09-12"};
                }
              };
            },
            delete(documentReference) {
              deleted.push(documentReference.path);
            }
          });
        }
      };
    }
  });

  assert.deepEqual(await repository.checkPausedTopicValidity({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    currentDate: "2026-09-27"
  }), {
    pausedDate: "2026-09-12",
    isPaused: false,
    unpaused: true
  });
  assert.deepEqual(deleted, [reference.path]);
});
