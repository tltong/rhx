const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {ESSAY_SCORING_CONFIG_COLLECTION, ESSAY_SCORING_CONFIG_DOCUMENT_ID} = require("../../../schema/essay_scoring_schema");
const {normalizeConfiguration, requireAdministratorUid, EssayScoringConfig} = require("../domain/essay_scoring_config");

class FirestoreEssayScoringConfigRepository {
  constructor({getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => FieldValue.serverTimestamp()} = {}) {
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
module.exports = {FirestoreEssayScoringConfigRepository};
