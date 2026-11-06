import {getFirestoreDb, getFirebaseNamespace} from "../../../utils/firebase/firebase_ops.js";
import {currentAccess, dates} from "../../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
import {guardStudentMaintenance} from "../../../utils/student_topic_reset_guard.js?v=20261104-fill-preassessment-v3";
import {id, problem, validateAnswers} from "../../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";

export class FirestoreFillInTheBlanksSubmissionRepository {
  constructor({getDb = getFirestoreDb, timestamp = () => getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
    access = currentAccess, guard = guardStudentMaintenance, requestId = () => crypto.randomUUID()} = {}) {
    Object.assign(this, {getDb, timestamp, access, guard, requestId});
  }
  ref(input, kind) {
    return this.getDb().collection("studentFillInTheBlanksPractices").doc(id(input.studentId, "studentId")).collection(kind).doc(id(input.practiceId, "practiceId"));
  }
  async read(input, kind) {
    const context = this.access(), snapshot = await this.ref(input, kind).get(); context.assertAccess();
    if (!snapshot.exists) return null;
    const {leaseToken, leaseUntil, ...data} = dates(snapshot.data());
    const retryAt = leaseUntil ?? (data.markingStatus === "submitted" && data.requestedAt ? new Date(data.requestedAt.getTime() + 120000) : null);
    return {...data, retryAt};
  }
  async submit(input, questions, language) {
    const context = this.access(), answers = validateAnswers(questions, input.answers, language);
    if (!Number.isFinite(input.timeTakenSeconds) || input.timeTakenSeconds < 0) throw problem("timeTakenSeconds must be a nonnegative number.");
    const db = this.getDb(), ref = this.ref(input, "submissions");
    await db.runTransaction(async tx => {
      await this.guard(tx, db.collection("studentPracticeResets").doc(id(input.studentId)));
      const [saved, assignment, completion] = await Promise.all([tx.get(ref), tx.get(this.ref(input, "assignedPractices")), tx.get(this.ref(input, "completedPractices"))]);
      context.assertAccess();
      if (completion.exists) return;
      if (!assignment.exists) throw problem("The practice is not assigned to this student.", "not-found");
      if (saved.exists) {
        const previous = dates(saved.data());
        if (previous.markingStatus === "marking" && previous.leaseUntil > new Date()) return;
        if (previous.markingStatus === "submitted" && previous.requestedAt?.getTime() + 120000 > Date.now()) return;
        // The student's original answers and timing are immutable across retries.
        tx.update(ref, {requestId: this.requestId(), requestedAt: this.timestamp()});
      } else tx.set(ref, {answers, timeTakenSeconds: input.timeTakenSeconds, submittedAt: this.timestamp(),
        markingStatus: "submitted", requestId: this.requestId(), requestedAt: this.timestamp()});
    });
    context.assertAccess();
  }
  async retryCompletion(input) {
    const context = this.access(), db = this.getDb(), ref = this.ref(input, "submissions");
    await db.runTransaction(async tx => {
      await this.guard(tx, db.collection("studentPracticeResets").doc(id(input.studentId)));
      const [submission, completion, processing] = await Promise.all([tx.get(ref), tx.get(this.ref(input, "completedPractices")), tx.get(this.ref(input, "completionProcessing"))]);
      context.assertAccess();
      if (!submission.exists || !completion.exists) throw problem("A saved completed passage is required.", "failed-precondition");
      const state = dates(processing.data());
      if (state?.status === "completed" || state?.status === "processing" && state.leaseUntil > new Date()) return;
      tx.update(ref, {requestId: this.requestId(), requestedAt: this.timestamp()});
    });
    context.assertAccess();
  }
}
