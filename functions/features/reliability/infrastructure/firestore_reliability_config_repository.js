const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {RELIABILITY_COLLECTION, RELIABILITY_CONFIG_DOCUMENT_ID} = require("../../../schema/reliability_schema");
const {ReliabilityConfig, requireConfigurationInput, requireAdministratorUid} = require("../domain/reliability_config");
const {ReliabilityConfigRepository} = require("../domain/reliability_config_repository");

class FirestoreReliabilityConfigRepository extends ReliabilityConfigRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    serverTimestamp = () => FieldValue.serverTimestamp(),
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

module.exports = {FirestoreReliabilityConfigRepository};
