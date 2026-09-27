const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

test("daily mission repository reads the agreed Firestore paths", async () => {
  const collectionReads = [];
  const documentReads = [];
  const idReads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readCollection(path) {
      collectionReads.push(path);
      return [{id: "topic-2", lastAcceptedDate: "2026-09-20"}];
    },
    async readDocument(collectionPath, documentId) {
      documentReads.push({collectionPath, documentId});
      return {
        coreMission: {topicId: "topic-1", practiceId: "practice-1"},
      };
    },
    async readCollectionIds(path) {
      idReads.push(path);

      if (path.endsWith("/coreTopics")) {
        return ["topic-1"];
      }

      if (path.endsWith("/practices")) {
        return ["practice-1"];
      }

      return ["topic-paused"];
    },
  });

  assert.deepEqual(await repository.getCoreMission({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    date: "2026-09-27",
  }), {
    topicId: "topic-1",
    practiceId: "practice-1",
  });
  assert.deepEqual(await repository.listPausedTopicIds({
    studentId: "student-1",
    syllabusId: "syllabus-1",
  }), ["topic-paused"]);
  assert.deepEqual(await repository.listTopicStats({
    studentId: "student-1",
    syllabusId: "syllabus-1",
  }), [{
    topicId: "topic-2",
    lastAcceptedDate: "2026-09-20",
  }]);

  assert.deepEqual(idReads, [
    "studentDailyMissions/student-1/pausedTopics/"
      + "syllabus-1/topics",
  ]);
  assert.deepEqual(documentReads, [{
    collectionPath: "studentDailyMissions/student-1/days/2026-09-27/"
      + "syllabuses",
    documentId: "syllabus-1",
  }]);
  assert.deepEqual(collectionReads, [
    "studentDailyMissions/student-1/missionStats/"
      + "syllabus-1/topics",
  ]);
});

test("daily mission repository rejects an invalid core reference", async () => {
  const repository = new FirestoreDailyMissionRepository({
    async readDocument() {
      return {
        coreMission: {
          topicId: "topic-1",
        },
      };
    },
  });

  await assert.rejects(
    () => repository.getCoreMission({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      date: "2026-09-27",
    }),
    /coreMission.practiceId is required/,
  );
});
