import {getDocumentRef} from "./firebase/firebase_ops.js";
function key({syllabusId, topicId}) {return encodeURIComponent(JSON.stringify([syllabusId, topicId]));}
export async function captureTopicPracticeGuard(scope) {
  const snapshot = await getDocumentRef("studentPracticeResets", scope.studentId).get();
  const data = snapshot.data();
  if (data?.activeResetId) throw Object.assign(new Error("Student practice maintenance is in progress. Please try again shortly."), {code: "student-maintenance"});
  return {studentId: scope.studentId, key: key(scope), revision: data?.topics?.[key(scope)]?.revision ?? 0};
}
export async function guardStudentMaintenance(transaction, ref, resetGuard) {
  const snapshot = await transaction.get(ref), data = snapshot.data();
  if (data?.activeResetId) throw Object.assign(new Error("Student practice maintenance is in progress. Please try again shortly."), {code: "student-maintenance"});
  if (resetGuard && (resetGuard.studentId !== ref.id || (data?.topics?.[resetGuard.key]?.revision ?? 0) !== resetGuard.revision)) {
    throw Object.assign(new Error("This practice generation was cancelled by a topic reset."), {code: "topic-practice-reset"});
  }
  return data;
}
