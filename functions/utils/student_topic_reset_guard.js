const {AsyncLocalStorage} = require("node:async_hooks");
const firebaseOps = require("./firebase/firebase_ops");
const {topicKey, resetError} = require("../features/student_topic_practice_reset/domain/reset_scope");
const storage = new AsyncLocalStorage();

function rootRef(db, studentId) {return db.collection("studentPracticeResets").doc(studentId);}
function assertState(data, context) {
  for (const scope of context.scopes) {
    const key = topicKey(scope), marker = data?.topics?.[key];
    if (data?.activeResetId && data.activeTopicKey === key || (marker?.revision ?? 0) !== scope.revision) {
      throw resetError("topic-practice-reset", "This practice was cancelled by a topic reset.");
    }
  }
}
async function guardResetTransaction(transaction, db) {
  const context = storage.getStore();
  if (!context) return;
  const snapshot = await transaction.get(rootRef(db, context.studentId));
  assertState(snapshot.exists ? snapshot.data() : null, context);
}
async function guardStudentMaintenance(transaction, ref) {
  const snapshot = await transaction.get(ref);
  if (snapshot.exists && snapshot.data().activeResetId) throw resetError("student-maintenance", "Student practice maintenance is in progress. Please try again shortly.");
  return snapshot.exists ? snapshot.data() : null;
}
function hasResetGuard() {return Boolean(storage.getStore());}
async function withTopicResetGuard({studentId, scopes, createdAt}, operation, {getFirestoreDb = firebaseOps.getFirestoreDb} = {}) {
  // Nested feature calls must retain the original epoch, rather than recapturing it after a reset.
  if (storage.getStore()) return operation();
  const snapshot = await rootRef(getFirestoreDb(), studentId).get(), data = snapshot.exists ? snapshot.data() : null;
  const created = createdAt?.toDate?.() ?? createdAt;
  const context = {studentId, scopes: scopes.map(scope => {
    const key = topicKey(scope), marker = data?.topics?.[key];
    const resetAt = marker?.resetAt?.toDate?.() ?? marker?.resetAt;
    if (data?.activeResetId && data.activeTopicKey === key
        || created instanceof Date && resetAt instanceof Date && created <= resetAt) {
      throw resetError("topic-practice-reset", "This practice was cancelled by a topic reset.");
    }
    return {...scope, revision: marker?.revision ?? 0};
  })};
  return storage.run(context, operation);
}
module.exports = {guardResetTransaction, guardStudentMaintenance, hasResetGuard, withTopicResetGuard};
