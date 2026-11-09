import {getFirestoreDb, getFirebaseNamespace} from "../../../utils/firebase/firebase_ops.js";
import {SUBJECT_ASSESSMENT_CONFIGS_COLLECTION, SUBJECT_ASSESSMENT_CONFIG_LANGUAGES,
  SUBJECT_ASSESSMENT_SETTINGS_COLLECTION, SUBJECT_ASSESSMENT_SETTINGS_DOCUMENT} from "../../../config/firebase/subject_assessment_config_schema.js?v=20261109-assessment-repeat-policy-v1";
import {requireScope, requireConfigurationInput, canonicalScope, topicOption, resolveAllocations,
  requireDocumentId, configurationError, readConfiguration, requireSettingsInput, readSettings} from "../domain/subject_assessment_config.js?v=20261109-assessment-repeat-policy-v1";

class FirestoreSubjectAssessmentConfigRepository {
  constructor({getDb = getFirestoreDb, serverTimestamp = () => getFirebaseNamespace().firestore.FieldValue.serverTimestamp()} = {}) {
    Object.assign(this, {getDb, serverTimestamp});
  }

  settingsReference() {return this.getDb().collection(SUBJECT_ASSESSMENT_SETTINGS_COLLECTION).doc(SUBJECT_ASSESSMENT_SETTINGS_DOCUMENT);}

  async getSettings() {
    const saved = await this.settingsReference().get();
    return saved.exists ? readSettings(saved.data()) : null;
  }

  async saveSettings(input, {updatedBy, assertAccess = () => {}}) {
    const settings = requireSettingsInput(input), reference = this.settingsReference();
    requireDocumentId(updatedBy, "administrator UID");
    await this.getDb().runTransaction(async transaction => {
      assertAccess();
      const saved = await transaction.get(reference), previous = saved.data();
      if ((previous?.version ?? 0) !== settings.expectedVersion) throw configurationError("The global settings were changed in another session. Reload them before saving.", "aborted");
      const version = (previous?.version ?? 0) + 1;
      if (!Number.isSafeInteger(version)) throw configurationError("The settings version is invalid.");
      const timestamp = this.serverTimestamp();
      assertAccess();
      transaction.set(reference, {repeatMode: settings.repeatMode, intervalDays: settings.intervalDays, version, createdBy: previous?.createdBy ?? updatedBy,
        createdAt: previous?.createdAt ?? timestamp, updatedBy, updatedAt: timestamp});
    });
    assertAccess();
    return this.getSettings();
  }

  reference(input) {
    const scope = requireScope(input);
    return this.getDb().collection(SUBJECT_ASSESSMENT_CONFIGS_COLLECTION).doc(scope.syllabusId)
      .collection(SUBJECT_ASSESSMENT_CONFIG_LANGUAGES).doc(scope.languageKey);
  }

  async get(input) {
    const snapshot = await this.reference(input).get();
    return snapshot.exists ? readConfiguration(snapshot.data()) : null;
  }

  async options(input, transaction = null, topicIds = null) {
    const scope = requireScope(input), db = this.getDb();
    const read = reference => transaction ? transaction.get(reference) : reference.get();
    const syllabusRef = db.collection("syllabuses").doc(scope.syllabusId);
    const syllabusSnapshot = await read(syllabusRef);
    const canonical = canonicalScope(scope, syllabusSnapshot.exists ? syllabusSnapshot.data() : null);
    const topicSnapshots = topicIds
      ? await Promise.all(topicIds.map(topicId => read(syllabusRef.collection("topics").doc(topicId))))
      : (await syllabusRef.collection("topics").get()).docs;
    const frameworkIds = new Set();
    for (const topic of topicSnapshots) {
      const id = topic.data()?.assessmentFrameworkIds?.[scope.languageKey];
      if (id) frameworkIds.add(requireDocumentId(id, "topic format reference"));
    }
    const frameworks = new Map(await Promise.all([...frameworkIds].map(async id => {
      const snapshot = await read(db.collection("assessmentFrameworks").doc(id));
      return [id, snapshot.exists ? snapshot.data() : null];
    })));
    return {...canonical, topics: topicSnapshots.map(snapshot => {
      const topic = snapshot.exists ? snapshot.data() : null;
      return topicOption(snapshot.id, topic, frameworks.get(topic?.assessmentFrameworkIds?.[scope.languageKey]));
    }).sort((a, b) => a.topicName.localeCompare(b.topicName))};
  }

  async save(input, {updatedBy, assertAccess = () => {}}) {
    const configuration = requireConfigurationInput(input);
    requireDocumentId(updatedBy, "administrator UID");
    const reference = this.reference(configuration);
    await this.getDb().runTransaction(async transaction => {
      assertAccess();
      const context = await this.options(configuration, transaction, configuration.topics.map(topic => topic.topicId));
      const topics = resolveAllocations(configuration.topics, context.topics);
      const existing = await transaction.get(reference);
      const previous = existing.exists ? existing.data() : null;
      if ((previous?.version ?? 0) !== configuration.expectedVersion) {
        throw configurationError("This configuration was changed in another session. Reload it before saving.", "aborted");
      }
      const version = (previous?.version ?? 0) + 1;
      if (!Number.isSafeInteger(version)) throw configurationError("The configuration version is invalid.");
      const timestamp = this.serverTimestamp();
      assertAccess();
      transaction.set(reference, {syllabusId: context.syllabusId, language: context.language, languageKey: context.languageKey,
        topics, version, createdBy: previous?.createdBy ?? updatedBy, createdAt: previous?.createdAt ?? timestamp,
        updatedBy, updatedAt: timestamp});
    });
    assertAccess();
    return this.get(configuration);
  }
}

export {FirestoreSubjectAssessmentConfigRepository};
