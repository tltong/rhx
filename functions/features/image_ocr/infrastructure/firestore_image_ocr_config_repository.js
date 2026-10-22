const {FieldValue} = require("firebase-admin/firestore");
const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {normalizeOcrSettings} = require("../../../utils/llm/image_ocr_settings");
class FirestoreImageOcrConfigRepository {
  constructor({getDb = getFirestoreDb, serverTimestamp = () => FieldValue.serverTimestamp()} = {}) {Object.assign(this, {getDb, serverTimestamp});}
  reference() {return this.getDb().collection("imageOcr").doc("config");}
  async getConfig() {
    const snapshot = await this.reference().get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    return {...normalizeOcrSettings(data), updatedAt: data.updatedAt?.toDate?.().toISOString() || null, updatedBy: data.updatedBy || null};
  }
  async saveConfig(input, uid) {
    await this.reference().set({...normalizeOcrSettings(input), updatedBy: uid, updatedAt: this.serverTimestamp()}, {merge: false});
    const saved = await this.getConfig();
    if (!saved) throw new Error("Saved OCR configuration could not be read.");
    return saved;
  }
}
module.exports = {FirestoreImageOcrConfigRepository};
