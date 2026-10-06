const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

test("unpauseTopic deletes only the paused topic document", async () => {
  const deletes = [];
  const repository = new FirestoreDailyMissionRepository({
    async deleteDocument(collectionPath, documentId) {
      deletes.push({collectionPath, documentId});
    },
  });

  assert.equal(await repository.unpauseTopic({
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
  }), undefined);
  assert.deepEqual(deletes, [{
    collectionPath: "studentDailyMissions/student-1/"
      + "pausedTopics/syllabus-1/topics",
    documentId: "topic-1",
  }]);
});
