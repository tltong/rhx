/**
 * Public APIs:
 *
 * getStudentStreamSubscription(studentId)
 *   -> Promise<StreamSubscription|null>
 * subscribeStudentToStream(studentId, streamId)
 *   -> Promise<StreamSubscription>
 * unsubscribeStudentFromStream(studentId)
 *   -> Promise<void>
 */
import {
  getStreamById
} from "../stream/stream_module.js?v=20260823-stream-language-v1";
import {
  GetStudentStreamSubscription
} from "./application/get_student_stream_subscription.js?v=20260823-stream-subscription-v1";
import {
  SubscribeStudentToStream
} from "./application/subscribe_student_to_stream.js?v=20260823-stream-subscription-v1";
import {
  UnsubscribeStudentFromStream
} from "./application/unsubscribe_student_from_stream.js?v=20260823-stream-subscription-v1";
import {
  FirestoreStreamSubscriptionRepository
} from "./infrastructure/firestore_stream_subscription_repository.js?v=20260823-stream-subscription-v1";

const streamSubscriptionRepository =
  new FirestoreStreamSubscriptionRepository();
const getStudentStreamSubscriptionUseCase =
  new GetStudentStreamSubscription(streamSubscriptionRepository);
const subscribeStudentToStreamUseCase =
  new SubscribeStudentToStream({
    streamSubscriptionRepository,
    getStreamById
  });
const unsubscribeStudentFromStreamUseCase =
  new UnsubscribeStudentFromStream(streamSubscriptionRepository);

async function getStudentStreamSubscription(studentId) {
  return getStudentStreamSubscriptionUseCase.execute(studentId);
}

async function subscribeStudentToStream(studentId, streamId) {
  return subscribeStudentToStreamUseCase.execute(studentId, streamId);
}

async function unsubscribeStudentFromStream(studentId) {
  return unsubscribeStudentFromStreamUseCase.execute(studentId);
}

export {
  getStudentStreamSubscription,
  subscribeStudentToStream,
  unsubscribeStudentFromStream
};
