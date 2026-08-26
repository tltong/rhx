/**
 * Public APIs:
 *
 * getStudentStreamSubscription(studentId)
 *   -> Promise<StreamSubscription|null>
 * subscribeStudentToStream(studentId, streamId)
 *   -> Promise<StreamSubscription>
 * subscribeStudentToStreamSyllabuses(studentId, streamId)
 *   -> Promise<{
 *     studentId: string,
 *     streamId: string,
 *     country: string,
 *     level: string,
 *     year: number,
 *     streamSubscription: StreamSubscription,
 *     syllabusSubscriptions: SyllabusSubscription[]
 *   }>
 * unsubscribeStudentFromStream(studentId)
 *   -> Promise<void>
 */
import {
  getStreamById
} from "../stream/stream_module.js?v=20260823-stream-language-v1";
import {
  getStudentAcademicScope
} from "../student/student_module.js?v=20260825-stream-syllabus-subscriptions-v1";
import {
  GetStudentStreamSubscription
} from "./application/get_student_stream_subscription.js?v=20260823-stream-subscription-v1";
import {
  SubscribeStudentToStream
} from "./application/subscribe_student_to_stream.js?v=20260823-stream-subscription-v1";
import {
  SubscribeStudentToStreamSyllabuses
} from "./application/subscribe_student_to_stream_syllabuses.js?v=20260825-stream-syllabus-subscriptions-v1";
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

async function subscribeSyllabusThroughFeature(studentId, syllabusId, language) {
  const { subscribeSyllabus } = await import(
    "../syllabus_subscription/syllabus_subscription_module.js?v=20260825-stream-syllabus-subscriptions-v1"
  );

  return subscribeSyllabus(studentId, syllabusId, language);
}

const subscribeStudentToStreamSyllabusesUseCase =
  new SubscribeStudentToStreamSyllabuses({
    getStudentAcademicScope,
    getStreamById,
    subscribeStudentToStream: (studentId, streamId) => (
      subscribeStudentToStreamUseCase.execute(studentId, streamId)
    ),
    subscribeSyllabus: subscribeSyllabusThroughFeature
  });

async function getStudentStreamSubscription(studentId) {
  return getStudentStreamSubscriptionUseCase.execute(studentId);
}

async function subscribeStudentToStream(studentId, streamId) {
  return subscribeStudentToStreamUseCase.execute(studentId, streamId);
}

async function subscribeStudentToStreamSyllabuses(studentId, streamId) {
  return subscribeStudentToStreamSyllabusesUseCase.execute(studentId, streamId);
}

async function unsubscribeStudentFromStream(studentId) {
  return unsubscribeStudentFromStreamUseCase.execute(studentId);
}

export {
  getStudentStreamSubscription,
  subscribeStudentToStream,
  subscribeStudentToStreamSyllabuses,
  unsubscribeStudentFromStream
};
