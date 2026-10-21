const {FieldValue} = require("firebase-admin/firestore");
const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {normalizeImageSettings} = require("../../../utils/llm/image_generation_settings");

class FirestoreImageGenerationConfigRepository {
  constructor({getDb = getFirestoreDb, serverTimestamp = () => FieldValue.serverTimestamp()} = {}) {
    Object.assign(this, {getDb, serverTimestamp});
  }
  reference() {return this.getDb().collection("imageGeneration").doc("config");}
  async getConfig() {
    const snapshot = await this.reference().get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    return {...normalizeImageSettings(data), updatedAt: data.updatedAt?.toDate?.().toISOString() || null, updatedBy: data.updatedBy || null};
  }
  async saveConfig(settings, updatedBy) {
    await this.reference().set({...normalizeImageSettings(settings), updatedBy, updatedAt: this.serverTimestamp()}, {merge: false});
    return this.getConfig();
  }
}
module.exports = {FirestoreImageGenerationConfigRepository};
