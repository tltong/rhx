import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {TUTOR_COLLECTION, TUTOR_CONFIG_DOCUMENT_ID} from "../../../config/firebase/tutor_schema.js?v=20261015-tutor-count-variants-v1";
import {TutorConfig, requireConfigurationInput, requireAdministratorUid} from "../domain/tutor_config.js?v=20261014-tutor-config-v1";
import {TutorConfigRepository} from "../domain/tutor_config_repository.js?v=20261014-tutor-config-v1";

class FirestoreTutorConfigRepository extends TutorConfigRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
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

export {FirestoreTutorConfigRepository};

