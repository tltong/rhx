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
const {
  getStreamById,
} = require("../stream/stream_module");
const {
  GetStudentStreamSubscription,
} = require("./application/get_student_stream_subscription");
const {
  SubscribeStudentToStream,
} = require("./application/subscribe_student_to_stream");
const {
  UnsubscribeStudentFromStream,
} = require("./application/unsubscribe_student_from_stream");
const {
  FirestoreStreamSubscriptionRepository,
} = require(
  "./infrastructure/firestore_stream_subscription_repository",
);

const streamSubscriptionRepository =
  new FirestoreStreamSubscriptionRepository();
const getStudentStreamSubscriptionUseCase =
  new GetStudentStreamSubscription(streamSubscriptionRepository);
const subscribeStudentToStreamUseCase =
  new SubscribeStudentToStream({
    streamSubscriptionRepository,
    getStreamById,
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

module.exports = {
  getStudentStreamSubscription,
  subscribeStudentToStream,
  unsubscribeStudentFromStream,
};
