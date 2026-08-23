import {
  STREAM_SUBSCRIPTIONS_COLLECTION
} from "../../../config/firebase/stream_subscription_schema.js";
import {
  deleteDocument,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  StreamSubscription
} from "../domain/stream_subscription.js?v=20260823-stream-subscription-v1";
import {
  StreamSubscriptionRepository
} from "../domain/stream_subscription_repository.js";

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
    streamId: data.streamId
  });
}

export class FirestoreStreamSubscriptionRepository
  extends StreamSubscriptionRepository {
  async getByStudentId(studentId) {
    const selectedStudentId = requireIdentifier(studentId, "studentId");
    const data = await readDocument(
      STREAM_SUBSCRIPTIONS_COLLECTION,
      selectedStudentId
    );

    return toStreamSubscription(data, selectedStudentId);
  }

  async save(streamSubscription) {
    const subscription = streamSubscription instanceof StreamSubscription
      ? streamSubscription
      : new StreamSubscription(streamSubscription);

    await writeDocument(
      STREAM_SUBSCRIPTIONS_COLLECTION,
      subscription.studentId,
      { streamId: subscription.streamId },
      { merge: false }
    );

    return subscription;
  }

  async delete(studentId) {
    return deleteDocument(
      STREAM_SUBSCRIPTIONS_COLLECTION,
      requireIdentifier(studentId, "studentId")
    );
  }
}
