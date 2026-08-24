const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreStudentPracticeRepository,
} = require("./firestore_student_practice_repository");

function completionRecord(id, dateCompleted, isCorrect) {
  return {
    id,
    dateCompleted: {toDate: () => new Date(dateCompleted)},
    questionsCorrect: isCorrect ? 1 : 0,
    totalQuestions: 1,
    score: isCorrect ? 100 : 0,
    timeTakenSeconds: 30,
    studentAnswers: {
      question1: {
        selectedOption: "a",
        correctAnswer: isCorrect ? "a" : "b",
        isCorrect,
      },
    },
  };
}

test("listCompleted maps records and sorts newest first", async () => {
  const repository = new FirestoreStudentPracticeRepository({
    readCollection: async (collectionPath) => {
      assert.equal(
        collectionPath,
        "studentPractices/student-1/completedPractices",
      );
      return [
        completionRecord("practice-old", "2026-08-20T00:00:00Z", true),
        completionRecord("practice-new", "2026-08-24T00:00:00Z", false),
      ];
    },
  });

  const completions = await repository.listCompleted(" student-1 ");

  assert.deepEqual(
    completions.map((completion) => completion.practiceId),
    ["practice-new", "practice-old"],
  );
  assert.equal(completions[0].studentId, "student-1");
  assert.equal(completions[0].score, 0);
  assert.ok(completions[0].dateCompleted instanceof Date);
});
