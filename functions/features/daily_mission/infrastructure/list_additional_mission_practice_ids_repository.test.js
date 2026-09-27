const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreDailyMissionRepository,
} = require("./firestore_daily_mission_repository");

test("reads accepted additional practices at their candidate paths", async () => {
  const reads = [];
  const repository = new FirestoreDailyMissionRepository({
    async readDocuments(documents, options) {
      reads.push({documents, options});
      return [null, {}];
    },
  });

  assert.deepEqual(
    await repository.listAcceptedAdditionalPracticeIds({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      date: "2026-09-27",
      candidates: [
        {topicId: "topic-1", practiceId: "practice-1"},
        {topicId: "topic-2", practiceId: "practice-2"},
        {topicId: "topic-1", practiceId: "practice-1"},
      ],
    }),
    ["practice-2"],
  );
  assert.deepEqual(reads, [{
    documents: [
      {
        collectionPath: "studentDailyMissions/student-1/days/"
          + "2026-09-27/syllabuses/syllabus-1/additionalTopics/"
          + "topic-1/practices",
        documentId: "practice-1",
      },
      {
        collectionPath: "studentDailyMissions/student-1/days/"
          + "2026-09-27/syllabuses/syllabus-1/additionalTopics/"
          + "topic-2/practices",
        documentId: "practice-2",
      },
    ],
    options: {includeId: false},
  }]);
});

test("does not access Firestore when there are no additional candidates", async () => {
  let reads = 0;
  const repository = new FirestoreDailyMissionRepository({
    async readDocuments() {
      reads += 1;
      return [];
    },
  });

  assert.deepEqual(
    await repository.listAcceptedAdditionalPracticeIds({
      studentId: "student-1",
      syllabusId: "syllabus-1",
      date: "2026-09-27",
      candidates: [],
    }),
    [],
  );
  assert.equal(reads, 0);
});
