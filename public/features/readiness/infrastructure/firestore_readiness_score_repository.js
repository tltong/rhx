import * as firebaseOps from "../../../utils/firebase/firebase_ops.js";
import {STUDENT_READINESS_COLLECTION, READINESS_SYLLABUSES_SUBCOLLECTION, READINESS_TOPICS_SUBCOLLECTION, READINESS_HISTORY_SUBCOLLECTION} from "../../../config/firebase/student_readiness_schema.js?v=20261007-readiness-completion-v1";
import {requireTopicScope, requireReadinessScore, normalizeSourcePracticeId, ReadinessScore, ReadinessScoreHistoryEntry} from "../domain/readiness_score.js?v=20261007-readiness-completion-v1";
import {ReadinessScoreRepository} from "../domain/readiness_score_repository.js?v=20261007-readiness-completion-v1";
const defaultServerTimestamp = () => firebaseOps.getFirebaseNamespace().firestore.FieldValue.serverTimestamp();

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
    const score = requireReadinessScore(input.score);
    const practiceId = normalizeSourcePracticeId(input.practiceId);
    const topicDocument = this.getDocumentRef(topicCollectionPath(scope), scope.topicId);
    const historyCollection = this.getCollectionRef(historyCollectionPath(scope));
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
        transaction.set(topicDocument, latestRecord, {merge: true});
        transaction.set(historyDocument, {score, savedAt: timestamp, practiceId});
      });
    } else {
      const batch = this.getFirestoreDb().batch();
      batch.set(topicDocument, latestRecord, {merge: true});
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
    const records = await this.readCollection(
      historyCollectionPath(scope),
      (collection) => collection.orderBy("savedAt", "desc"),
    );
    // Preserve Firestore ordering, including timestamps within the same millisecond.
    return records.map((record) => new ReadinessScoreHistoryEntry(record));
  }
}

export {FirestoreReadinessScoreRepository};
