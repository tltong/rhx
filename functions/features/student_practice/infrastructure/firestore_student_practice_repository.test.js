const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreStudentPracticeRepository,
} = require("./firestore_student_practice_repository");

test("listAssignedIds reads and sorts assigned practice document IDs", async () => {
  const repository = new FirestoreStudentPracticeRepository({
    readCollectionIds: async (collectionPath) => {
      assert.equal(
        collectionPath,
        "studentPractices/student-1/assignedPractices",
      );
      return ["practice-2", "practice-1"];
    },
  });

  assert.deepEqual(
    await repository.listAssignedIds("student-1"),
    ["practice-1", "practice-2"],
  );
});

test("listCompletedIds reads and sorts completed practice document IDs", async () => {
  const repository = new FirestoreStudentPracticeRepository({
    readCollectionIds: async (collectionPath) => {
      assert.equal(
        collectionPath,
        "studentPractices/student-1/completedPractices",
      );
      return ["practice-3", "practice-1"];
    },
  });

  assert.deepEqual(
    await repository.listCompletedIds("student-1"),
    ["practice-1", "practice-3"],
  );
});
