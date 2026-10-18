import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {
  QUESTION_SEED_GENERATOR_COLLECTION, QUESTION_SEED_GENERATOR_CONFIG_DOCUMENT_ID,
} from "../../../config/firebase/question_seed_generator_schema.js?v=20261017-seed-association-order-v1";
import {
  QuestionSeedGeneratorConfig, normalizeConfiguration, requireAdministratorUid,
} from "../domain/question_seed_generator_config.js?v=20261017-seed-association-order-v1";
import {requireVertical, normalizeEntry, entryKey, normalizeEntries, normalizeEntriesInput, normalizeRemovalInput} from "../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";
import {QuestionSeedGeneratorRepository} from "../domain/question_seed_generator_repository.js?v=20261017-seed-association-order-v1";

class FirestoreQuestionSeedGeneratorRepository extends QuestionSeedGeneratorRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp(),
  } = {}) {
    super();
    Object.assign(this, {readDocument, writeDocument, getFirestoreDb, serverTimestamp});
  }

  async getConfig() {
    const data = await this.readDocument(QUESTION_SEED_GENERATOR_COLLECTION,
      QUESTION_SEED_GENERATOR_CONFIG_DOCUMENT_ID, {includeId: false});
    return data === null ? null : new QuestionSeedGeneratorConfig(data);
  }

  async saveConfig(input, {beforeWrite = () => {}} = {}) {
    const configuration = normalizeConfiguration(input);
    const updatedBy = requireAdministratorUid(input.updatedBy);
    beforeWrite();
    await this.writeDocument(QUESTION_SEED_GENERATOR_COLLECTION, QUESTION_SEED_GENERATOR_CONFIG_DOCUMENT_ID, {
      ...configuration, updatedAt: this.serverTimestamp(), updatedBy,
    }, {merge: false});
    const saved = await this.getConfig();
    if (!saved) throw new Error("Saved question seed generator configuration could not be read.");
    return saved;
  }

  async getEntries(vertical) {
    requireVertical(vertical);
    const data = await this.readDocument(QUESTION_SEED_GENERATOR_COLLECTION, vertical, {includeId: false});
    // Read former string entries as unassigned objects without writing on a read.
    return data === null ? [] : normalizeEntries(data.entries, {allowLegacy: true});
  }

  async saveEntries(input, {beforeWrite = () => {}} = {}) {
    const {vertical, entries} = normalizeEntriesInput(input);
    beforeWrite();
    await this.writeDocument(QUESTION_SEED_GENERATOR_COLLECTION, vertical, {entries}, {merge: false});
    return normalizeEntries(entries);
  }

  async saveEntry(vertical, entry, {beforeWrite = () => {}} = {}) {
    requireVertical(vertical);
    const normalized = normalizeEntry(entry);
    const key = entryKey(normalized);
    beforeWrite();
    const db = this.getFirestoreDb();
    const reference = db.collection(QUESTION_SEED_GENERATOR_COLLECTION).doc(vertical);
    return db.runTransaction(async transaction => {
      beforeWrite();
      const snapshot = await transaction.get(reference);
      const entries = snapshot.exists ? normalizeEntries(snapshot.data().entries, {allowLegacy: true}) : [];
      const index = entries.findIndex(existing => entryKey(existing) === key);
      const saved = {value: index < 0 ? normalized.value : entries[index].value, associations: normalized.associations};
      if (index < 0) entries.push(saved);
      else entries[index] = saved;
      beforeWrite();
      transaction.set(reference, {entries});
      return saved;
    });
  }

  async appendEntryIfUnique(vertical, entry, {beforeWrite = () => {}} = {}) {
    requireVertical(vertical);
    const normalized = normalizeEntry(entry);
    const key = entryKey(normalized);
    beforeWrite();
    const db = this.getFirestoreDb();
    const reference = db.collection(QUESTION_SEED_GENERATOR_COLLECTION).doc(vertical);
    // The LLM runs outside the transaction. Recheck against the latest list on
    // every transaction attempt so concurrent generations do not lose entries.
    return db.runTransaction(async transaction => {
      beforeWrite();
      const snapshot = await transaction.get(reference);
      const entries = snapshot.exists ? normalizeEntries(snapshot.data().entries, {allowLegacy: true}) : [];
      beforeWrite();
      if (entries.some(existing => entryKey(existing) === key)) return false;
      transaction.set(reference, {entries: [...entries, normalized]});
      return true;
    });
  }

  async removeEntries(vertical, entries, {beforeWrite = () => {}} = {}) {
    const normalized = normalizeRemovalInput({vertical, entries});
    const selectedKeys = new Set(normalized.entries.map(entryKey));
    beforeWrite();
    const db = this.getFirestoreDb();
    const reference = db.collection(QUESTION_SEED_GENERATOR_COLLECTION).doc(normalized.vertical);
    return db.runTransaction(async transaction => {
      beforeWrite();
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? normalizeEntries(snapshot.data().entries, {allowLegacy: true}) : [];
      const remaining = current.filter(entry => !selectedKeys.has(entryKey(entry)));
      beforeWrite();
      // Read current data on each attempt so concurrent additions are preserved.
      // Already-removed selections are harmless and never recreate a missing pool.
      if (remaining.length !== current.length) transaction.set(reference, {entries: remaining});
      return remaining;
    });
  }
}

export {FirestoreQuestionSeedGeneratorRepository};
