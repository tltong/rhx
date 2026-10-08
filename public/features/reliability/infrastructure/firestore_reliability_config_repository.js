import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {RELIABILITY_COLLECTION, RELIABILITY_CONFIG_DOCUMENT_ID} from "../../../config/firebase/reliability_schema.js?v=20261008-reliability-v1";
import {ReliabilityConfig, requireConfigurationInput, requireAdministratorUid} from "../domain/reliability_config.js?v=20261008-reliability-v1";
import {ReliabilityConfigRepository} from "../domain/reliability_config_repository.js?v=20261008-reliability-v1";

class FirestoreReliabilityConfigRepository extends ReliabilityConfigRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
    this.serverTimestamp = serverTimestamp;
  }

  async get() {
    const data = await this.readDocument(RELIABILITY_COLLECTION, RELIABILITY_CONFIG_DOCUMENT_ID);
    return data === null ? null : new ReliabilityConfig(data);
  }

  async save(input) {
    const configuration = requireConfigurationInput(input);
    const updatedBy = requireAdministratorUid(input.updatedBy);
    await this.writeDocument(RELIABILITY_COLLECTION, RELIABILITY_CONFIG_DOCUMENT_ID, {
      ...configuration, updatedAt: this.serverTimestamp(), updatedBy,
    }, {merge: false});
    return this.get();
  }
}

export {FirestoreReliabilityConfigRepository};
