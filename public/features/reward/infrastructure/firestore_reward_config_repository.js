import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {REWARDS_COLLECTION, REWARD_CONFIG_DOCUMENT_ID, REWARD_ASSESSMENT_FRAMEWORKS_SUBCOLLECTION} from "../../../config/firebase/reward_schema.js?v=20261013-recent-reward-activities-v1";
import {RewardConfig, AssessmentFrameworkRewardConfig, requireConfigurationInput, requireFrameworkScope, requireFrameworkConfigurationInput, requireAdministratorUid} from "../domain/reward_config.js?v=20261013-recent-reward-activities-v1";
import {RewardConfigRepository} from "../domain/reward_config_repository.js?v=20261013-recent-reward-activities-v1";

const frameworkCollectionPath = REWARDS_COLLECTION + "/" + REWARD_CONFIG_DOCUMENT_ID + "/" + REWARD_ASSESSMENT_FRAMEWORKS_SUBCOLLECTION;
class FirestoreRewardConfigRepository extends RewardConfigRepository {
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
  async getGlobal() {
    const data = await this.readDocument(REWARDS_COLLECTION, REWARD_CONFIG_DOCUMENT_ID);
    return data === null ? null : new RewardConfig(data);
  }
  async saveGlobal(input) {
    const configuration = requireConfigurationInput(input);
    const updatedBy = requireAdministratorUid(input.updatedBy);
    await this.writeDocument(REWARDS_COLLECTION, REWARD_CONFIG_DOCUMENT_ID, {
      ...configuration, updatedAt: this.serverTimestamp(), updatedBy,
    }, {merge: false});
    return this.getGlobal();
  }
  async getFramework(input) {
    const scope = requireFrameworkScope(input);
    const data = await this.readDocument(frameworkCollectionPath, scope.assessmentFrameworkId);
    return data === null ? null : new AssessmentFrameworkRewardConfig({...data, ...scope});
  }
  async saveFramework(input) {
    const {assessmentFrameworkId, levelCoins} = requireFrameworkConfigurationInput(input);
    const updatedBy = requireAdministratorUid(input.updatedBy);
    await this.writeDocument(frameworkCollectionPath, assessmentFrameworkId, {
      levelCoins, updatedAt: this.serverTimestamp(), updatedBy,
    }, {merge: false});
    return this.getFramework({assessmentFrameworkId});
  }
}

export {FirestoreRewardConfigRepository};
