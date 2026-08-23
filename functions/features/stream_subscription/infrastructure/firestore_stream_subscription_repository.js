const {
  STREAM_SUBSCRIPTIONS_COLLECTION,
} = require("../../../schema/stream_subscription_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  StreamSubscription,
} = require("../domain/stream_subscription");
const {
  StreamSubscriptionRepository,
} = require("../domain/stream_subscription_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function toStreamSubscription(data, studentId) {
  if (!data) {
    return null;
  }

  return new StreamSubscription({
    studentId,
    streamId: data.streamId,
  });
}

class FirestoreStreamSubscriptionRepository
  extends StreamSubscriptionRepository {
  constructor({
    deleteDocument = firebaseOps.deleteDocument,
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.deleteDocument = deleteDocument;
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
  }

  async getByStudentId(studentId) {
    const selectedStudentId = requireIdentifier(studentId, "studentId");
    const data = await this.readDocument(
      STREAM_SUBSCRIPTIONS_COLLECTION,
      selectedStudentId,
    );

    return toStreamSubscription(data, selectedStudentId);
  }

  async save(streamSubscription) {
    const subscription = streamSubscription instanceof StreamSubscription
      ? streamSubscription
      : new StreamSubscription(streamSubscription);

    await this.writeDocument(
      STREAM_SUBSCRIPTIONS_COLLECTION,
      subscription.studentId,
      {streamId: subscription.streamId},
      {merge: false},
    );

    return subscription;
  }

  async delete(studentId) {
    return this.deleteDocument(
      STREAM_SUBSCRIPTIONS_COLLECTION,
      requireIdentifier(studentId, "studentId"),
    );
  }
}

module.exports = {
  FirestoreStreamSubscriptionRepository,
};
