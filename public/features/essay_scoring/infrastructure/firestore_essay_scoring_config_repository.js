import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {ESSAY_SCORING_CONFIG_COLLECTION, ESSAY_SCORING_CONFIG_DOCUMENT_ID} from "../../../config/firebase/essay_scoring_schema.js?v=20261020-scoring-config-v1";
import {normalizeConfiguration, requireAdministratorUid, EssayScoringConfig} from "../domain/essay_scoring_config.js?v=20261020-scoring-config-v1";

class FirestoreEssayScoringConfigRepository {
  constructor({getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp()} = {}) {
    Object.assign(this, {getFirestoreDb, serverTimestamp});
  }
  reference() {return this.getFirestoreDb().collection(ESSAY_SCORING_CONFIG_COLLECTION).doc(ESSAY_SCORING_CONFIG_DOCUMENT_ID);}
  async getConfig() {
    const snapshot = await this.reference().get();
    return snapshot.exists ? new EssayScoringConfig(snapshot.data()) : null;
  }
  async saveConfig(input, {beforeWrite = () => {}} = {}) {
    const configuration = normalizeConfiguration(input);
    const updatedBy = requireAdministratorUid(input.updatedBy);
    beforeWrite();
    await this.reference().set({...configuration, updatedAt: this.serverTimestamp(), updatedBy}, {merge: false});
    const saved = await this.getConfig();
    if (!saved) throw new Error("Saved essay scoring configuration could not be read.");
    return saved;
  }
}
export {FirestoreEssayScoringConfigRepository};
