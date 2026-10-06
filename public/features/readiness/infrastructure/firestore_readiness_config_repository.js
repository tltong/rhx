import {
  getDocumentRef,
  getFirestoreDb,
  getFirebaseNamespace,
  readDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  READINESS_CONFIGS_COLLECTION,
  READINESS_CONFIG_DOCUMENT_ID,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_NUMBER_OF_PRACTICES,
  DEFAULT_PRE_ASSESSMENT_WEIGHT
} from "../../../config/firebase/readiness_config_schema.js?v=20261006-readiness-feature-api-v1";
import {
  ReadinessConfig,
  normalizeReadinessConfigChanges,
  requireAdministratorUid
} from "../domain/readiness_config.js?v=20261006-readiness-feature-api-v1";
import {ReadinessConfigRepository} from "../domain/readiness_config_repository.js?v=20261006-readiness-feature-api-v1";

export class FirestoreReadinessConfigRepository extends ReadinessConfigRepository {
  constructor({
    readDocument: read = readDocument,
    getDocumentRef: getReference = getDocumentRef,
    getFirestoreDb: getDatabase = getFirestoreDb,
    serverTimestamp = () => getFirebaseNamespace().firestore.FieldValue.serverTimestamp()
  } = {}) {
    super();
    this.readDocument = read;
    this.getDocumentRef = getReference;
    this.getFirestoreDb = getDatabase;
    this.serverTimestamp = serverTimestamp;
  }

  async get() {
    const data = await this.readDocument(
      READINESS_CONFIGS_COLLECTION,
      READINESS_CONFIG_DOCUMENT_ID
    );
    return data === null ? null : new ReadinessConfig(data);
  }

  async save(input) {
    const changes = normalizeReadinessConfigChanges(input);
    const administratorUid = requireAdministratorUid(input.updatedBy);
    const document = this.getDocumentRef(
      READINESS_CONFIGS_COLLECTION,
      READINESS_CONFIG_DOCUMENT_ID
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
        updatedBy: administratorUid
      });
      transaction.set(document, {
        difficultyWeights: {...config.difficultyWeights},
        numberOfPractices: config.numberOfPractices,
        preAssessmentWeight: config.preAssessmentWeight,
        updatedAt: this.serverTimestamp(),
        updatedBy: administratorUid
      }, {merge: false});
    });
    return this.get();
  }
}
