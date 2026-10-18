const assert = require("node:assert/strict");
const test = require("node:test");
const {FirestoreEssayResultRepository} = require("./firestore_essay_result_repository");
test("completion-driven grading keeps the newest submission result when AI requests finish out of order", async () => {
  let saved = null;
  const ref = {get: async () => ({exists: Boolean(saved), data: () => saved})};
  const db = {collection: () => ({doc: () => ({collection: () => ({doc: () => ref})})}),
    async runTransaction(operation) {return operation({get: () => ref.get(), set: (_, data) => {saved = data;}});}};
  const repository = new FirestoreEssayResultRepository({getFirestoreDb: () => db, serverTimestamp: () => new Date("2026-10-18T10:00:00Z")});
  const input = {studentId: "student", questionId: "question", answer: "Newer essay", score: 90,
    reviewComment: "The newer essay develops its ideas clearly.", corrections: []};
  await repository.save(input, {submittedAt: new Date("2026-10-18T09:00:00Z")});
  const result = await repository.save({...input, answer: "Older essay", score: 30, reviewComment: "Develop your examples."}, {submittedAt: new Date("2026-10-18T08:00:00Z")});
  assert.equal(result.answer, "Newer essay"); assert.equal(result.score, 90);
  assert.equal(result.reviewComment, input.reviewComment);
  assert.equal(saved.submittedAt.toISOString(), "2026-10-18T09:00:00.000Z");
});
