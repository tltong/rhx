import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {guardStudentMaintenance} from "../../../utils/student_topic_reset_guard.js?v=20261018-topic-reset-v1";
import {STUDENT_ESSAY_PRACTICES_COLLECTION, ASSIGNED_ESSAY_PRACTICES_SUBCOLLECTION,
  COMPLETED_ESSAY_PRACTICES_SUBCOLLECTION, ESSAY_QUESTION_USAGE_SUBCOLLECTION} from "../../../config/firebase/student_essay_practice_schema.js?v=20261018-essay-reuse-v1";
import {normalizeAssignment, normalizeCompletion, normalizeReference, normalizeListInput,
  readAssignment, readCompletion, sameAssignment, encodeCursor, decodeCursor} from "../domain/student_essay_practice.js?v=20261018-essay-session-v1";

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

  questionUsage(studentId, essayQuestionId) {
    return this.getFirestoreDb().collection(STUDENT_ESSAY_PRACTICES_COLLECTION).doc(studentId)
      .collection(ESSAY_QUESTION_USAGE_SUBCOLLECTION).doc(essayQuestionId);
  }

  recordQuestionUsage(transaction, ref, assignment, essayPracticeId) {
    transaction.set(ref, {essayPracticeId, syllabusId: assignment.syllabusId,
      topicId: assignment.topicId, assignedAt: assignment.assignedAt ?? this.serverTimestamp()});
  }

  async assign(input, {assertAccess = () => {}, sourceCompletion, preventQuestionReuse = false} = {}) {
    const assignment = normalizeAssignment(input);
    assertAccess();
    const db = this.getFirestoreDb();
    const assignments = this.collection(assignment.studentId, "assigned");
    const assigned = assignment.essayPracticeId === undefined ? assignments.doc() : assignments.doc(assignment.essayPracticeId);
    const reference = {studentId: assignment.studentId, essayPracticeId: assigned.id};
    const completed = this.collection(reference.studentId, "completed").doc(reference.essayPracticeId);
    await db.runTransaction(async transaction => {
      await guardStudentMaintenance(transaction, db.collection("studentPracticeResets").doc(assignment.studentId));
      if (sourceCompletion) {
        const sourceRef = normalizeReference({studentId: assignment.studentId, essayPracticeId: sourceCompletion.essayPracticeId});
        const source = await transaction.get(this.collection(sourceRef.studentId, "completed").doc(sourceRef.essayPracticeId));
        const date = source.data()?.completedAt?.toDate?.() ?? source.data()?.completedAt;
        if (!source.exists || !(sourceCompletion.completedAt instanceof Date) || !(date instanceof Date)
            || date.getTime() !== sourceCompletion.completedAt.getTime()
            || source.data().syllabusId !== assignment.syllabusId || source.data().topicId !== assignment.topicId) {
          throw Object.assign(new Error("The source essay was removed or reset."), {code: "topic-practice-reset"});
        }
      }
      assertAccess();
      const existing = await transaction.get(assigned);
      const completion = await transaction.get(completed);
      const usageRef = this.questionUsage(assignment.studentId, assignment.essayQuestionId);
      const usage = await transaction.get(usageRef);
      if (completion.exists) throw new Error("This essay practice has already been completed.");
      if (existing.exists) {
        if (!sameAssignment(readAssignment(existing.data(), reference), assignment)) {
          throw new Error("The essay practice ID is already assigned to a different question or topic.");
        }
        if (!usage.exists) this.recordQuestionUsage(transaction, usageRef, existing.data(), assigned.id);
        return;
      }
      if (preventQuestionReuse && usage.exists && usage.data().essayPracticeId !== assigned.id) {
        throw Object.assign(new Error("This essay question has already been assigned to this student."), {code: "essay-question-already-used"});
      }
      assertAccess();
      if (!usage.exists) this.recordQuestionUsage(transaction, usageRef, assignment, assigned.id);
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
      await guardStudentMaintenance(transaction, db.collection("studentPracticeResets").doc(reference.studentId));
      assertAccess();
      const existing = await transaction.get(completed);
      const assignment = await transaction.get(assigned);
      const stored = existing.exists ? readCompletion(existing.data(), reference)
        : assignment.exists ? readAssignment(assignment.data(), reference) : null;
      const usageRef = stored ? this.questionUsage(reference.studentId, stored.essayQuestionId) : null;
      const usage = usageRef ? await transaction.get(usageRef) : null;
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
        if (!usage.exists) this.recordQuestionUsage(transaction, usageRef, stored, reference.essayPracticeId);
        return;
      }
      if (!assignment.exists) throw new Error("The assigned essay practice could not be found.");
      const savedAssignment = stored;
      if (!usage.exists) this.recordQuestionUsage(transaction, usageRef, stored, reference.essayPracticeId);
      transaction.set(completed, {
        essayQuestionId: savedAssignment.essayQuestionId, syllabusId: savedAssignment.syllabusId,
        topicId: savedAssignment.topicId, assignedAt: savedAssignment.assignedAt,
        completedAt: this.serverTimestamp(),
        essayText: completion.essayText, timeTakenSeconds: completion.timeTakenSeconds,
        scoring: {status: "pending"},
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
  watchChanges(studentId, onChange, onError) {
    const stops = [];
    try {
      for (const kind of ["assigned", "completed"]) stops.push(this.collection(studentId, kind).onSnapshot(() => onChange(), onError));
    } catch (error) {stops.forEach(stop => stop()); throw error;}
    return () => stops.forEach(stop => stop());
  }
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

