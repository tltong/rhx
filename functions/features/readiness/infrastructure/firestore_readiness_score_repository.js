const {FieldValue} = require("firebase-admin/firestore");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {STUDENT_READINESS_COLLECTION, READINESS_SYLLABUSES_SUBCOLLECTION, READINESS_TOPICS_SUBCOLLECTION, READINESS_HISTORY_SUBCOLLECTION} = require("../../../schema/student_readiness_schema");
const {requireSubjectScope, requireTopicScope, requireReadinessScore, normalizeSourcePracticeId, ReadinessScore, ReadinessScoreHistoryEntry} = require("../domain/readiness_score");
const {ReadinessScoreRepository} = require("../domain/readiness_score_repository");
const defaultServerTimestamp = () => FieldValue.serverTimestamp();

function subjectCollectionPath({studentId}) {
  return [STUDENT_READINESS_COLLECTION, studentId, READINESS_SYLLABUSES_SUBCOLLECTION].join("/");
}

function subjectHistoryCollectionPath(scope) {
  return [subjectCollectionPath(scope), scope.syllabusId, READINESS_HISTORY_SUBCOLLECTION].join("/");
}

function topicCollectionPath({studentId, syllabusId}) {
  return [
    STUDENT_READINESS_COLLECTION, studentId,
    READINESS_SYLLABUSES_SUBCOLLECTION, syllabusId,
    READINESS_TOPICS_SUBCOLLECTION,
  ].join("/");
}

function historyCollectionPath(scope) {
  return [
    topicCollectionPath(scope), scope.topicId, READINESS_HISTORY_SUBCOLLECTION,
  ].join("/");
}

class FirestoreReadinessScoreRepository extends ReadinessScoreRepository {
  constructor({
    readDocument = firebaseOps.readDocument,
    readCollection = firebaseOps.readCollection,
    getDocumentRef = firebaseOps.getDocumentRef,
    getCollectionRef = firebaseOps.getCollectionRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = defaultServerTimestamp,
  } = {}) {
    super();
    this.readDocument = readDocument;
    this.readCollection = readCollection;
    this.getDocumentRef = getDocumentRef;
    this.getCollectionRef = getCollectionRef;
    this.getFirestoreDb = getFirestoreDb;
    this.serverTimestamp = serverTimestamp;
  }

  async get(input) {
    const scope = requireTopicScope(input);
    const data = await this.readDocument(topicCollectionPath(scope), scope.topicId);
    return data === null ? null : new ReadinessScore(data);
  }

  async save(input) {
    const scope = requireTopicScope(input);
    return this.saveRecord(input, topicCollectionPath(scope), scope.topicId, historyCollectionPath(scope));
  }

  async getSubject(input) {
    const scope = requireSubjectScope(input);
    const data = await this.readDocument(subjectCollectionPath(scope), scope.syllabusId);
    return data === null ? null : new ReadinessScore(data);
  }

  async saveSubject(input) {
    const scope = requireSubjectScope(input);
    return this.saveRecord(input, subjectCollectionPath(scope), scope.syllabusId, subjectHistoryCollectionPath(scope));
  }

  async saveRecord(input, collectionPath, documentId, historyPath) {
    const score = requireReadinessScore(input.score);
    const practiceId = normalizeSourcePracticeId(input.practiceId);
    const latestDocument = this.getDocumentRef(collectionPath, documentId);
    const historyCollection = this.getCollectionRef(historyPath);
    const historyDocument = practiceId === null
      ? historyCollection.doc() : historyCollection.doc(`practice-${practiceId}`);
    const timestamp = this.serverTimestamp();
    const latestRecord = {score, updatedAt: timestamp};

    if (practiceId !== null) {
      // A retried completion must neither append history again nor replace a
      // newer score. Transactions also protect concurrent deliveries.
      await this.getFirestoreDb().runTransaction(async (transaction) => {
        const existing = await transaction.get(historyDocument);
        if (existing.exists) {
          return;
        }
        transaction.set(latestDocument, latestRecord, {merge: true});
        transaction.set(historyDocument, {score, savedAt: timestamp, practiceId});
      });
    } else {
      const batch = this.getFirestoreDb().batch();
      batch.set(latestDocument, latestRecord, {merge: true});
      batch.set(historyDocument, {score, savedAt: timestamp});
      await batch.commit();
    }

    // Read this save's history entry, so a concurrent save cannot change the return value.
    const snapshot = await historyDocument.get();
    if (!snapshot.exists) {
      throw new Error("Saved readiness history entry could not be read.");
    }
    const entry = new ReadinessScoreHistoryEntry({
      ...snapshot.data(), id: historyDocument.id,
    });
    return new ReadinessScore({score: entry.score, updatedAt: entry.savedAt});
  }

  async listHistory(input) {
    const scope = requireTopicScope(input);
    return this.listHistoryRecords(historyCollectionPath(scope));
  }

  async listSubjectHistory(input) {
    const scope = requireSubjectScope(input);
    return this.listHistoryRecords(subjectHistoryCollectionPath(scope));
  }

  async listHistoryRecords(historyPath) {
    const records = await this.readCollection(
      historyPath,
      (collection) => collection.orderBy("savedAt", "desc"),
    );
    // Preserve Firestore ordering, including timestamps within the same millisecond.
    return records.map((record) => new ReadinessScoreHistoryEntry(record));
  }
}

module.exports = {FirestoreReadinessScoreRepository};
