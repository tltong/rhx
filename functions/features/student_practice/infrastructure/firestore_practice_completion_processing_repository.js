const {FieldValue} = require("firebase-admin/firestore");
const {
  COMPLETION_PROCESSING_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION,
} = require("../../../schema/student_practice_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {guardResetTransaction} = require("../../../utils/student_topic_reset_guard");
const {
  completionProcessingStages,
  completionProcessingStatuses,
  normalizeNullableDocumentId,
  normalizeProcessingIdentity,
  requireValue,
} = require("../domain/practice_completion_processing");
const {
  PracticeCompletionProcessingRepository,
} = require("../domain/practice_completion_processing_repository");

function completionProcessingCollectionPath(studentId) {
  return [
    STUDENT_PRACTICES_COLLECTION,
    studentId,
    COMPLETION_PROCESSING_SUBCOLLECTION,
  ].join("/");
}

function snapshotData(snapshot) {
  return snapshot?.exists ? snapshot.data() || {} : {};
}

class FirestorePracticeCompletionProcessingRepository
  extends PracticeCompletionProcessingRepository {
  constructor({
    getDocumentRef = firebaseOps.getDocumentRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    serverTimestamp = () => FieldValue.serverTimestamp(),
  } = {}) {
    super();
    this.getDocumentRef = getDocumentRef;
    this.getFirestoreDb = getFirestoreDb;
    this.serverTimestamp = serverTimestamp;
  }

  getProcessingDocument({studentId, practiceId}) {
    return this.getDocumentRef(
      completionProcessingCollectionPath(studentId),
      practiceId,
    );
  }

  async transition(input, createUpdate) {
    const identity = normalizeProcessingIdentity(input);
    const processingDocument = this.getProcessingDocument(identity);

    return this.getFirestoreDb().runTransaction(async (transaction) => {
      await guardResetTransaction(transaction, this.getFirestoreDb());
      const snapshot = await transaction.get(processingDocument);
      const existing = snapshotData(snapshot);

      if (existing.status === completionProcessingStatuses.COMPLETED) {
        return Object.freeze({
          ...identity,
          status: existing.status,
          stage: existing.stage,
          changed: false,
          shouldProcess: false,
        });
      }

      const timestamp = this.serverTimestamp();
      const update = createUpdate({existing, identity, timestamp});

      transaction.set(processingDocument, update, {merge: true});

      return Object.freeze({
        ...identity,
        status: update.status,
        stage: update.stage,
        changed: true,
        shouldProcess: true,
      });
    });
  }

  async markProcessing(input) {
    return this.transition(input, ({existing, identity, timestamp}) => ({
      status: completionProcessingStatuses.PROCESSING,
      stage: completionProcessingStages.ASSESSING,
      eventId: identity.eventId,
      startedAt: existing.startedAt || timestamp,
      updatedAt: timestamp,
      completedAt: null,
      generatedPracticeId: null,
      outcome: null,
      errorCode: null,
    }));
  }

  async markGenerating(input) {
    return this.transition(input, ({existing, identity, timestamp}) => ({
      status: completionProcessingStatuses.PROCESSING,
      stage: completionProcessingStages.GENERATING,
      eventId: identity.eventId,
      startedAt: existing.startedAt || timestamp,
      updatedAt: timestamp,
      completedAt: null,
      generatedPracticeId: null,
      outcome: null,
      errorCode: null,
    }));
  }

  async markCompleted({
    generatedPracticeId = null,
    outcome,
    ...input
  } = {}) {
    const normalizedGeneratedPracticeId = normalizeNullableDocumentId(
      generatedPracticeId,
      "generatedPracticeId",
    );
    const normalizedOutcome = requireValue(outcome, "outcome");

    return this.transition(input, ({existing, identity, timestamp}) => ({
      status: completionProcessingStatuses.COMPLETED,
      stage: completionProcessingStages.COMPLETED,
      eventId: identity.eventId,
      startedAt: existing.startedAt || timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
      generatedPracticeId: normalizedGeneratedPracticeId,
      outcome: normalizedOutcome,
      errorCode: null,
    }));
  }

  async markFailed({errorCode, ...input} = {}) {
    const normalizedErrorCode = requireValue(errorCode, "errorCode");

    return this.transition(input, ({existing, identity, timestamp}) => ({
      status: completionProcessingStatuses.FAILED,
      stage: completionProcessingStages.FAILED,
      eventId: identity.eventId,
      startedAt: existing.startedAt || timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
      generatedPracticeId: null,
      outcome: null,
      errorCode: normalizedErrorCode,
    }));
  }
}

module.exports = {
  FirestorePracticeCompletionProcessingRepository,
  completionProcessingCollectionPath,
};
