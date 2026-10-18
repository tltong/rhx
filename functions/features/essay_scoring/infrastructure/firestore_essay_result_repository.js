const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {guardResetTransaction} = require("../../../utils/student_topic_reset_guard");
const {ESSAY_RESULTS_COLLECTION, ESSAY_RESULT_QUESTIONS_SUBCOLLECTION} = require("../../../schema/essay_scoring_schema");
const {normalizeResultReference, normalizeResultInput, readEssayResult} = require("../domain/essay_result");
const {EssayResultRepository} = require("../domain/essay_result_repository");

const defaultServerTimestamp = () => FieldValue.serverTimestamp();

class FirestoreEssayResultRepository extends EssayResultRepository {
  constructor({
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = defaultServerTimestamp,
  } = {}) {
    super();
    Object.assign(this, {getFirestoreDb, serverTimestamp});
  }

  reference(input) {
    const {studentId, questionId} = normalizeResultReference(input);
    return this.getFirestoreDb().collection(ESSAY_RESULTS_COLLECTION).doc(studentId)
      .collection(ESSAY_RESULT_QUESTIONS_SUBCOLLECTION).doc(questionId);
  }

  async save(input, {assertAccess = () => {}, submittedAt} = {}) {
    const result = normalizeResultInput(input);
    assertAccess();
    const ref = this.reference(result);
    const data = {answer: result.answer, score: result.score,
      reviewComment: result.reviewComment, corrections: result.corrections, scoredAt: this.serverTimestamp()};
    assertAccess();
    if (submittedAt !== undefined) {
      if (!(submittedAt instanceof Date) || !Number.isFinite(submittedAt.getTime())) throw new Error("submittedAt must be a valid date.");
      // Completion triggers may finish out of order. Keep the newest submission's
      // result while retaining exactly one document per student/question.
      await this.getFirestoreDb().runTransaction(async transaction => {
        await guardResetTransaction(transaction, this.getFirestoreDb());
        const existing = await transaction.get(ref);
        const previous = existing.data()?.submittedAt;
        const previousDate = typeof previous?.toDate === "function" ? previous.toDate() : previous;
        if (previousDate instanceof Date && previousDate > submittedAt) return;
        assertAccess();
        transaction.set(ref, {...data, submittedAt}, {merge: false});
      });
    } else {
      await ref.set(data, {merge: false});
    }
    assertAccess();
    const snapshot = await ref.get();
    assertAccess();
    if (!snapshot.exists) throw new Error("Saved essay result could not be read.");
    return readEssayResult(snapshot.data(), result);
  }

  async get(input) {
    const reference = normalizeResultReference(input);
    const snapshot = await this.reference(reference).get();
    return snapshot.exists ? readEssayResult(snapshot.data(), reference) : null;
  }
}

module.exports = {FirestoreEssayResultRepository};

