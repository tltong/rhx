const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp, getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../site_admin/site_admin_module");
const {FieldValue} = require("firebase-admin/firestore");
const {normalizeEssayConfiguration, fromLegacyConfiguration, generatorConfiguration, gradeDocumentId, fail} = require("./domain/essay_config");

async function authorize(context) {
  const uid = context?.auth?.uid;
  if (!uid) throw fail("Sign in to administer essay configuration.", "unauthenticated");
  const user = await getAuth(getFirebaseApp()).getUser(uid);
  if (user.disabled || !user.emailVerified || !user.email || !await isSiteAdmin(user.email)) throw fail("A verified site administrator is required.", "permission-denied");
  return uid;
}
function createEssayConfigFeature({getDb = getFirestoreDb, requireAdministrator = authorize, timestamp = () => FieldValue.serverTimestamp()} = {}) {
  async function read(tx, db) {
    const settings = db.doc("essayConfig/settings");
    const common = await tx.get(settings);
    if (!common.exists) {
      const legacy = await tx.get(db.doc("essayQuestionGenerator/config"));
      return fromLegacyConfiguration(legacy.data() ?? {});
    }
    const types = await tx.get(db.collection("essayTypes"));
    const grades = await tx.get(db.collection("essayGradeConfigs"));
    const gradeSettings = {primary: {}, secondary: {}};
    for (const doc of grades.docs) {
      const grade = doc.data();
      if (gradeSettings[grade.level]) gradeSettings[grade.level][grade.standard] = grade;
    }
    const data = common.data();
    return {...normalizeEssayConfiguration({...data, essayTypes: types.docs.map(doc => ({...doc.data(), id: doc.id})), gradeSettings}),
      version: data.version, updatedAt: data.updatedAt, updatedBy: data.updatedBy};
  }
  // Internal read for trusted generation flows. Browser admin operations use the callable below.
  async function loadEssayConfiguration() {
    const db = getDb(); return db.runTransaction(tx => read(tx, db));
  }
  async function getEssayConfiguration(input, context) {
    if (!context?.auth?.uid) throw fail("Sign in to read essay configuration.", "unauthenticated");
    return loadEssayConfiguration();
  }
  async function saveEssayConfiguration(input, context) {
    const normalized = normalizeEssayConfiguration(input), expectedVersion = input.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw fail("expectedVersion is required.");
    const uid = await requireAdministrator(context);
    const db = getDb();
    return db.runTransaction(async tx => {
      const current = await read(tx, db);
      if (current.version !== expectedVersion) throw fail("Essay configuration changed. Reload before saving.", "aborted");
      const audit = {updatedBy: uid, updatedAt: timestamp()};
      for (const type of normalized.essayTypes) {
        const {id, ...data} = type; tx.set(db.collection("essayTypes").doc(id), {...data, ...audit});
      }
      for (const old of current.essayTypes) if (!normalized.essayTypes.some(type => type.id === old.id)) tx.delete(db.collection("essayTypes").doc(old.id));
      for (const grades of Object.values(normalized.gradeSettings)) for (const grade of Object.values(grades)) {
        tx.set(db.collection("essayGradeConfigs").doc(gradeDocumentId(grade.level, grade.standard)), {...grade, ...audit});
      }
      const {essayTypes, gradeSettings, ...common} = normalized;
      tx.set(db.doc("essayConfig/settings"), {...common, version: current.version + 1, ...audit});
      // Return exact normalized data without a second read that could observe another save.
      return {...normalized, version: current.version + 1, updatedBy: uid, updatedAt: new Date()};
    });
  }
  async function getGeneratorConfiguration() {return generatorConfiguration(await loadEssayConfiguration());}
  return {loadEssayConfiguration, getEssayConfiguration, saveEssayConfiguration, getGeneratorConfiguration};
}
module.exports = {...createEssayConfigFeature(), createEssayConfigFeature};
