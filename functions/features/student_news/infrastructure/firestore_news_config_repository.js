const {FieldValue} = require("firebase-admin/firestore");
const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {NEWS_CONFIG_COLLECTION} = require("../../../schema/student_news_config_schema");
const {NEWS_ARTICLE_TYPES, NEWS_LEVELS, NEWS_STANDARDS, gradeKey, fail, createDefaultNewsConfiguration, normalizeNewsConfiguration} = require("../domain/news_config");

class FirestoreNewsConfigRepository {
  constructor({getDb = getFirestoreDb, timestamp = () => FieldValue.serverTimestamp()} = {}) {this.getDb = getDb; this.timestamp = timestamp;}
  async read(transaction, db) {
    const snapshot = await transaction.get(db.collection(NEWS_CONFIG_COLLECTION));
    if (snapshot.empty) return createDefaultNewsConfiguration();
    const docs = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
    const settings = docs.get("settings");
    const expected = ["settings", ...NEWS_ARTICLE_TYPES.map(id => "type_" + id), ...NEWS_LEVELS.flatMap(level => NEWS_STANDARDS.map(standard => "grade_" + gradeKey(level, standard)))];
    if (docs.size !== expected.length || expected.some(id => !docs.has(id)) || settings?.kind !== "settings"
        || !Number.isSafeInteger(settings.version) || settings.version < 1) throw fail("Saved news configuration is incomplete. Restore all configuration documents before saving.", "failed-precondition");
    const {kind, version, updatedAt, updatedBy, ...common} = settings;
    const articleTypes = {}, gradeSettings = {primary: {}, secondary: {}};
    for (const id of NEWS_ARTICLE_TYPES) {
      const type = docs.get("type_" + id);
      if (type.kind !== "articleType" || type.articleTypeId !== id) throw fail("Saved news article type is inconsistent.", "failed-precondition");
      articleTypes[id] = {photoCount: type.photoCount, photoType: type.photoType};
    }
    for (const level of NEWS_LEVELS) for (const standard of NEWS_STANDARDS) {
      const grade = docs.get("grade_" + gradeKey(level, standard));
      if (grade.kind !== "grade" || grade.level !== level || grade.standard !== standard) throw fail("Saved news grade is inconsistent.", "failed-precondition");
      const {kind, version, updatedAt, updatedBy, ...values} = grade;
      gradeSettings[level][standard] = values;
    }
    try {return {...normalizeNewsConfiguration({...common, articleTypes, gradeSettings}), version, updatedAt, updatedBy};}
    catch (error) {throw fail("Saved news configuration is invalid: " + error.message, "failed-precondition");}
  }
  async get() {const db = this.getDb(); return db.runTransaction(tx => this.read(tx, db));}
  async save(input, {expectedVersion, updatedBy}) {
    const configuration = normalizeNewsConfiguration(input), db = this.getDb();
    return db.runTransaction(async tx => {
      const current = await this.read(tx, db);
      if (current.version !== expectedVersion) throw fail("News configuration changed. Reload the saved settings before saving again.", "aborted");
      if (current.version >= Number.MAX_SAFE_INTEGER) throw fail("News configuration revision limit reached.", "failed-precondition");
      const version = current.version + 1, audit = {version, updatedBy, updatedAt: this.timestamp()};
      const {articleTypes, gradeSettings, ...settings} = configuration;
      tx.set(db.doc(NEWS_CONFIG_COLLECTION + "/settings"), {kind: "settings", ...settings, ...audit});
      for (const id of NEWS_ARTICLE_TYPES) tx.set(db.doc(NEWS_CONFIG_COLLECTION + "/type_" + id), {kind: "articleType", articleTypeId: id, ...articleTypes[id], ...audit});
      for (const level of NEWS_LEVELS) for (const standard of NEWS_STANDARDS) tx.set(db.doc(NEWS_CONFIG_COLLECTION + "/grade_" + gradeKey(level, standard)), {kind: "grade", ...gradeSettings[level][standard], ...audit});
      return {...configuration, version, updatedBy, updatedAt: new Date()};
    });
  }
}
module.exports = {FirestoreNewsConfigRepository};
