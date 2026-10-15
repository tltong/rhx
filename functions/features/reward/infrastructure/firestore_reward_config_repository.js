const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {REWARDS_COLLECTION, REWARD_CONFIG_DOCUMENT_ID, REWARD_ASSESSMENT_FRAMEWORKS_SUBCOLLECTION} = require("../../../schema/reward_schema");
const {RewardConfig, AssessmentFrameworkRewardConfig, requireConfigurationInput, requireFrameworkScope, requireFrameworkConfigurationInput, requireAdministratorUid} = require("../domain/reward_config");
const {RewardConfigRepository} = require("../domain/reward_config_repository");

const frameworkCollectionPath = REWARDS_COLLECTION + "/" + REWARD_CONFIG_DOCUMENT_ID + "/" + REWARD_ASSESSMENT_FRAMEWORKS_SUBCOLLECTION;
class FirestoreRewardConfigRepository extends RewardConfigRepository {
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

module.exports = {FirestoreRewardConfigRepository};
