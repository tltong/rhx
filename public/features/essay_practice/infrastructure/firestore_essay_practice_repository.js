import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {ESSAY_PRACTICES_COLLECTION} from "../../../config/firebase/essay_practice_schema.js?v=20261018-preassessment-essay-v1";
import {requireId, normalizeEssayPractice, readEssayPractice} from "../domain/essay_practice.js?v=20261018-preassessment-essay-v1";

class FirestoreEssayPracticeRepository {
  constructor({getFirestoreDb = firebaseOps.getFirestoreDb} = {}) {this.getFirestoreDb = getFirestoreDb;}
  async create(input, {assertAccess = () => {}} = {}) {
    const data = normalizeEssayPractice(input);
    assertAccess();
    const ref = this.getFirestoreDb().collection(ESSAY_PRACTICES_COLLECTION).doc();
    await ref.set(data, {merge: false});
    assertAccess();
    const saved = await ref.get();
    assertAccess();
    if (!saved.exists) throw new Error("Saved essay practice could not be read.");
    return readEssayPractice(saved.data(), ref.id);
  }
  async getById(practiceId) {
    const id = requireId(practiceId, "practiceId");
    const saved = await this.getFirestoreDb().collection(ESSAY_PRACTICES_COLLECTION).doc(id).get();
    return saved.exists ? readEssayPractice(saved.data(), id) : null;
  }
}

export {FirestoreEssayPracticeRepository};

