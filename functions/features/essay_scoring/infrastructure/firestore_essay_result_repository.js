const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
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

  async save(input, {assertAccess = () => {}} = {}) {
    const result = normalizeResultInput(input);
    assertAccess();
    const ref = this.reference(result);
    const data = {answer: result.answer, score: result.score,
      corrections: result.corrections, scoredAt: this.serverTimestamp()};
    assertAccess();
    // A single atomic replacement keeps exactly one result per student and question.
    await ref.set(data, {merge: false});
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

