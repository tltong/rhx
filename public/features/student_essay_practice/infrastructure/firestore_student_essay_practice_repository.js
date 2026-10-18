import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {STUDENT_ESSAY_PRACTICES_COLLECTION, ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION,
  COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION} from "../../../config/firebase/student_essay_practice_schema.js?v=20261017-student-essay-practice-independent-v1";
import {normalizeAssignment, normalizeCompletion, normalizeReference, normalizeListInput,
  readAssignment, readCompletion, sameAssignment, encodeCursor, decodeCursor} from "../domain/student_essay_practice.js?v=20261017-student-essay-practice-independent-v1";

const defaultServerTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp();
const defaultDocumentId = () => firebaseOps.getFirebaseNamespace().firestore.FieldPath.documentId();

class FirestoreStudentEssayPracticeRepository {
  constructor({
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = defaultServerTimestamp,
    documentId = defaultDocumentId,
  } = {}) {
    Object.assign(this, {getFirestoreDb, serverTimestamp, documentId});
  }

  collection(studentId, kind) {
    const name = kind === "assigned" ? ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION
      : COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION;
    return this.getFirestoreDb().collection(STUDENT_ESSAY_PRACTICES_COLLECTION).doc(studentId).collection(name);
  }

  async assign(input, {assertAccess = () => {}} = {}) {
    const assignment = normalizeAssignment(input);
    assertAccess();
    const db = this.getFirestoreDb();
    const assignments = this.collection(assignment.studentId, "assigned");
    const assigned = assignment.essayPracticeId === undefined ? assignments.doc() : assignments.doc(assignment.essayPracticeId);
    const reference = {studentId: assignment.studentId, essayPracticeId: assigned.id};
    const completed = this.collection(reference.studentId, "completed").doc(reference.essayPracticeId);
    await db.runTransaction(async transaction => {
      assertAccess();
      const existing = await transaction.get(assigned);
      const completion = await transaction.get(completed);
      if (completion.exists) throw new Error("This essay practice has already been completed.");
      if (existing.exists) {
        if (!sameAssignment(readAssignment(existing.data(), reference), assignment)) {
          throw new Error("The essay practice ID is already assigned to a different question or topic.");
        }
        return;
      }
      assertAccess();
      transaction.set(db.collection(STUDENT_ESSAY_PRACTICES_COLLECTION).doc(reference.studentId), {}, {merge: true});
      transaction.set(assigned, {
        essayQuestionId: assignment.essayQuestionId, syllabusId: assignment.syllabusId,
        topicId: assignment.topicId, assignedAt: this.serverTimestamp(),
      });
    });
    assertAccess();
    const saved = await this.getAssigned(reference);
    if (!saved) throw new Error("Saved essay assignment could not be read.");
    return saved;
  }

  async complete(input, {assertAccess = () => {}} = {}) {
    const completion = normalizeCompletion(input);
    const reference = normalizeReference(completion);
    assertAccess();
    const db = this.getFirestoreDb();
    const assigned = this.collection(reference.studentId, "assigned").doc(reference.essayPracticeId);
    const completed = this.collection(reference.studentId, "completed").doc(reference.essayPracticeId);
    await db.runTransaction(async transaction => {
      assertAccess();
      const existing = await transaction.get(completed);
      const assignment = await transaction.get(assigned);
      assertAccess();
      if (existing.exists) {
        // A retry returns the original submission, even if its submitted text differs.
        const saved = readCompletion(existing.data(), reference);
        if (assignment.exists) {
          if (!sameAssignment(saved, readAssignment(assignment.data(), reference))) {
            throw new Error("The essay assignment conflicts with its saved completion.");
          }
          transaction.delete(assigned);
        }
        return;
      }
      if (!assignment.exists) throw new Error("The assigned essay practice could not be found.");
      const savedAssignment = readAssignment(assignment.data(), reference);
      transaction.set(completed, {
        essayQuestionId: savedAssignment.essayQuestionId, syllabusId: savedAssignment.syllabusId,
        topicId: savedAssignment.topicId, assignedAt: savedAssignment.assignedAt,
        completedAt: this.serverTimestamp(),
        essayText: completion.essayText, timeTakenSeconds: completion.timeTakenSeconds,
      });
      transaction.delete(assigned);
    });
    assertAccess();
    const saved = await this.getCompleted(reference);
    if (!saved) throw new Error("Saved essay completion could not be read.");
    return saved;
  }

  async getAssigned(input) {return this.get(input, "assigned");}
  async getCompleted(input) {return this.get(input, "completed");}
  async get(input, kind) {
    const reference = normalizeReference(input);
    const snapshot = await this.collection(reference.studentId, kind).doc(reference.essayPracticeId).get();
    if (!snapshot.exists) return null;
    return (kind === "assigned" ? readAssignment : readCompletion)(snapshot.data(), reference);
  }

  async listAssigned(input) {return this.list(input, "assigned");}
  async listCompleted(input) {return this.list(input, "completed");}
  async list(input, kind) {
    const criteria = normalizeListInput(input);
    const afterId = decodeCursor(criteria, kind);
    let query = this.collection(criteria.studentId, kind);
    for (const field of ["syllabusId", "topicId"]) {
      if (criteria[field] !== undefined) query = query.where(field, "==", criteria[field]);
    }
    query = query.orderBy(this.documentId());
    if (afterId) query = query.startAfter(afterId);
    const snapshot = await query.limit(criteria.limit + 1).get();
    const read = kind === "assigned" ? readAssignment : readCompletion;
    const practices = snapshot.docs.slice(0, criteria.limit).map(doc => read(doc.data(), {
      studentId: criteria.studentId, essayPracticeId: doc.id,
    }));
    return {practices, nextCursor: snapshot.docs.length > criteria.limit
      ? encodeCursor(criteria, kind, practices.at(-1).essayPracticeId) : null};
  }
}

export {FirestoreStudentEssayPracticeRepository};

