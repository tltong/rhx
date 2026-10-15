const {FirestoreStudentLoginRepository} = require("../infrastructure/firestore_student_login_repository");

async function pruneAllStudentLoginHistory({
  repository = new FirestoreStudentLoginRepository(),
  concurrency = 5,
} = {}) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error("Cleanup concurrency must be a whole number from 1 to 20.");
  }
  let cursor = null;
  let studentCount = 0;
  let deletedCount = 0;
  const errors = [];
  do {
    const page = await repository.listStudentIds({cursor});
    for (let start = 0; start < page.studentIds.length; start += concurrency) {
      const ids = page.studentIds.slice(start, start + concurrency);
      const results = await Promise.allSettled(ids.map((studentId) => repository.pruneHistory({studentId})));
      for (const [index, result] of results.entries()) {
        if (result.status === "fulfilled") {
          studentCount++;
          deletedCount += result.value.deletedCount;
        } else {
          errors.push(new Error("Login history cleanup failed for " + ids[index] + ".", {cause: result.reason}));
        }
      }
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
  if (errors.length) {
    throw new AggregateError(errors, "Student login history cleanup failed for " + errors.length + " student(s).");
  }
  return {studentCount, deletedCount};
}

module.exports = {pruneAllStudentLoginHistory};
