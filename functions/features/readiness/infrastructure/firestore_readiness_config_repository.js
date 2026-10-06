const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  READINESS_CONFIGS_COLLECTION,
  READINESS_CONFIG_DOCUMENT_ID,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT,
} = require("../../../schema/readiness_config_schema");
const {
  ReadinessConfig,
  normalizeReadinessConfigChanges,
  requireAdministratorUid,
} = require("../domain/readiness_config");
const {ReadinessConfigRepository} = require("../domain/readiness_config_repository");

class FirestoreReadinessConfigRepository extends ReadinessConfigRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    getDocumentRef = firebaseOps.getDocumentRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => FieldValue.serverTimestamp(),
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.getDocumentRef = getDocumentRef;
    this.getFirestoreDb = getFirestoreDb;
    this.serverTimestamp = serverTimestamp;
  }

  async get() {
    const data = await this.readDocument(
      READINESS_CONFIGS_COLLECTION,
      READINESS_CONFIG_DOCUMENT_ID,
    );
    return data === null ? null : new ReadinessConfig(data);
  }

  async save(input) {
    const changes = normalizeReadinessConfigChanges(input);
    const administratorUid = requireAdministratorUid(input.updatedBy);
    const document = this.getDocumentRef(
      READINESS_CONFIGS_COLLECTION,
      READINESS_CONFIG_DOCUMENT_ID,
    );
    await this.getFirestoreDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      const config = new ReadinessConfig({
        difficultyWeights: DEFAULT_DIFFICULTY_WEIGHTS,
        numberOfPractices: DEFAULT_NUMBER_OF_PRACTICES,
        preAssessmentWeight: DEFAULT_PRE_ASSESSMENT_WEIGHT,
        ...(snapshot.exists ? snapshot.data() : {}),
        ...changes,
        updatedAt: new Date(),
        updatedBy: administratorUid,
      });
      transaction.set(document, {
        difficultyWeights: {...config.difficultyWeights},
        numberOfPractices: config.numberOfPractices,
        preAssessmentWeight: config.preAssessmentWeight,
        updatedAt: this.serverTimestamp(),
        updatedBy: administratorUid,
      }, {merge: false});
    });
    return this.get();
  }
}

module.exports = {FirestoreReadinessConfigRepository};
