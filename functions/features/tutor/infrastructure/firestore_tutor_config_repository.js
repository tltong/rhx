const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {TUTOR_COLLECTION, TUTOR_CONFIG_DOCUMENT_ID} = require("../../../schema/tutor_schema");
const {TutorConfig, requireConfigurationInput, requireAdministratorUid} = require("../domain/tutor_config");
const {TutorConfigRepository} = require("../domain/tutor_config_repository");

class FirestoreTutorConfigRepository extends TutorConfigRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    serverTimestamp = () => FieldValue.serverTimestamp(),
  } = {}) {
    super();
    Object.assign(this, {readDocument, writeDocument, serverTimestamp});
  }

  async get() {
    const data = await this.readDocument(TUTOR_COLLECTION, TUTOR_CONFIG_DOCUMENT_ID, {includeId: false});
    return data === null ? null : new TutorConfig(data);
  }

  async save(input) {
    const configuration = requireConfigurationInput(input);
    const updatedBy = requireAdministratorUid(input.updatedBy);
    await this.writeDocument(TUTOR_COLLECTION, TUTOR_CONFIG_DOCUMENT_ID, {
      ...configuration, updatedAt: this.serverTimestamp(), updatedBy,
    }, {merge: false});
    const saved = await this.get();
    if (!saved) throw new Error("Saved tutor configuration could not be read.");
    return saved;
  }
}

module.exports = {FirestoreTutorConfigRepository};

