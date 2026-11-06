import {getFirestoreDb} from "../../utils/firebase/firebase_ops.js";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {FirestoreFillInTheBlanksSubmissionRepository} from "./infrastructure/firestore_submission_repository.js?v=20261105-chinese-count-v1";
import {withAccess, requireAdministrator} from "../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
import {requireStudentSubscriptionAccess} from "../syllabus_subscription/student_access_module.js?v=20261104-fill-preassessment-v3";
export function watchStudentFillInTheBlanksPracticeUpdates({studentId}, onChange, onError = () => {}) {
  const user = requireCurrentFirebaseAuthUser();
  if (typeof studentId !== "string" || !studentId.trim() || studentId.includes("/")) throw new Error("A valid studentId is required.");
  if (typeof onChange !== "function" || typeof onError !== "function") throw new Error("Watch callbacks are required.");
  const db = getFirestoreDb(), stops = [];
  try {
    for (const path of [
      "studentFillInTheBlanksPractices/" + studentId + "/assignedPractices",
      "studentFillInTheBlanksPractices/" + studentId + "/submissions",
      "studentFillInTheBlanksPractices/" + studentId + "/completedPractices",
      "studentFillInTheBlanksPractices/" + studentId + "/completionProcessing",
      "studentFillInTheBlanksPracticeGenerations/" + studentId + "/completions",
      "studentFillInTheBlanksPracticeGenerations/" + studentId + "/initials",
    ]) stops.push(db.collection(path).onSnapshot(() => {
      try {if (requireCurrentFirebaseAuthUser().uid === user.uid) onChange();} catch (error) {onError(error);}
    }, onError));
  } catch (error) {stops.forEach(stop => stop()); throw error;}
  return () => stops.forEach(stop => stop());
}


import {id} from "../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";
function studentCollection(studentId, kind) {return getFirestoreDb().collection("studentFillInTheBlanksPractices").doc(id(studentId, "studentId")).collection(kind);}
function readPractice(snapshot, studentId) {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  return {studentId, practiceId: snapshot.id, ...data,
    ...Object.fromEntries(["assignedAt", "completedAt", "dateCompleted"].filter(key => data[key]).map(key => [key, data[key]?.toDate?.() ?? data[key]]))};
}
async function readStudentPractice(input, kind) {
  const user = requireCurrentFirebaseAuthUser(), snapshot = await studentCollection(input.studentId, kind).doc(id(input.practiceId, "practiceId")).get();
  if (requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed.");
  return readPractice(snapshot, input.studentId);
}
async function listStudentPractices(input, kind) {
  const user = requireCurrentFirebaseAuthUser(), studentId = id(input.studentId), limit = Math.max(1, Math.min(100, input.limit ?? 100));
  let query = studentCollection(studentId, kind);
  for (const key of ["syllabusId", "topicId"]) if (input[key]) query = query.where(key, "==", id(input[key], key));
  query = query.orderBy("__name__");
  if (input.cursor) {
    let cursor;
    try {cursor = JSON.parse(atob(input.cursor.replace(/-/g, "+").replace(/_/g, "/")));} catch {throw new Error("Invalid practice history cursor.");}
    if (cursor.kind !== kind || cursor.studentId !== studentId || cursor.syllabusId !== (input.syllabusId ?? null) || cursor.topicId !== (input.topicId ?? null)) throw new Error("Practice history cursor does not match its filters.");
    query = query.startAfter(id(cursor.after));
  }
  const snapshot = await query.limit(limit + 1).get();
  if (requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed.");
  const docs = snapshot.docs.slice(0, limit);
  return {practices: docs.map(doc => readPractice(doc, studentId)), nextCursor: snapshot.docs.length > limit
    ? btoa(JSON.stringify({kind, studentId, syllabusId: input.syllabusId ?? null, topicId: input.topicId ?? null, after: docs.at(-1).id})).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null};
}
export const getAssignedFillInTheBlanksPractice = input => readStudentPractice(input, "assignedPractices");
export const getCompletedFillInTheBlanksPractice = input => readStudentPractice(input, "completedPractices");
export const listAssignedFillInTheBlanksPractices = input => listStudentPractices(input, "assignedPractices");
export const listCompletedFillInTheBlanksPractices = input => listStudentPractices(input, "completedPractices");

const submissionRepository = new FirestoreFillInTheBlanksSubmissionRepository();
export const getFillInTheBlanksSubmission = input => withAccess(() => submissionRepository.read(input, "submissions"));
export const getFillInTheBlanksCompletionProcessing = input => withAccess(() => submissionRepository.read(input, "completionProcessing"));
async function studentWrite(input, operation) {
  return withAccess(async context => {
    if (context.updatedBy !== input.studentId) await requireAdministrator(context);
    else await requireStudentSubscriptionAccess(input.studentId);
    context.assertAccess(); return operation();
  });
}
export const submitFillInTheBlanksAnswers = (input, questions, language) => studentWrite(input, () => submissionRepository.submit(input, questions, language));
export const retryFillInTheBlanksCompletion = input => studentWrite(input, () => submissionRepository.retryCompletion(input));
