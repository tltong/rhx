import {
  FirestoreSyllabusSubscriptionRepository
} from "./infrastructure/firestore_syllabus_subscription_repository.js?v=20260716-no-eager-auth";
import {
  GetStudentSyllabusSubscription
} from "./application/get_student_syllabus_subscription.js?v=20260716-no-eager-auth";
import {
  ListStudentSyllabusSubscriptions
} from "./application/list_student_syllabus_subscriptions.js?v=20260716-no-eager-auth";
import {
  ListActiveStudentSyllabusSubscriptions
} from "./application/list_active_student_syllabus_subscriptions.js?v=20260716-no-eager-auth";
import {
  SubscribeSyllabus
} from "./application/subscribe_syllabus.js?v=20260716-no-eager-auth";
import {
  UnsubscribeSyllabus
} from "./application/unsubscribe_syllabus.js?v=20260716-no-eager-auth";
import {
  ActivateSyllabus
} from "./application/activate_syllabus.js?v=20260716-no-eager-auth";
import {
  DeactivateSyllabus
} from "./application/deactivate_syllabus.js?v=20260716-no-eager-auth";

const syllabusSubscriptionRepository =
  new FirestoreSyllabusSubscriptionRepository();
const getStudentSyllabusSubscriptionUseCase =
  new GetStudentSyllabusSubscription(syllabusSubscriptionRepository);
const listStudentSyllabusSubscriptionsUseCase =
  new ListStudentSyllabusSubscriptions(syllabusSubscriptionRepository);
const listActiveStudentSyllabusSubscriptionsUseCase =
  new ListActiveStudentSyllabusSubscriptions(syllabusSubscriptionRepository);
const subscribeSyllabusUseCase =
  new SubscribeSyllabus(syllabusSubscriptionRepository);
const unsubscribeSyllabusUseCase =
  new UnsubscribeSyllabus(syllabusSubscriptionRepository);
const activateSyllabusUseCase =
  new ActivateSyllabus(syllabusSubscriptionRepository);
const deactivateSyllabusUseCase =
  new DeactivateSyllabus(syllabusSubscriptionRepository);

async function getStudentSyllabusSubscription(studentId, syllabusId) {
  return getStudentSyllabusSubscriptionUseCase.execute(studentId, syllabusId);
}

async function listStudentSyllabusSubscriptions(studentId) {
  return listStudentSyllabusSubscriptionsUseCase.execute(studentId);
}

async function listActiveStudentSyllabusSubscriptions(studentId) {
  return listActiveStudentSyllabusSubscriptionsUseCase.execute(studentId);
}

async function subscribeSyllabus(studentId, syllabusId) {
  return subscribeSyllabusUseCase.execute(studentId, syllabusId);
}

async function unsubscribeSyllabus(studentId, syllabusId) {
  return unsubscribeSyllabusUseCase.execute(studentId, syllabusId);
}

async function activateSyllabus(studentId, syllabusId) {
  return activateSyllabusUseCase.execute(studentId, syllabusId);
}

async function deactivateSyllabus(studentId, syllabusId) {
  return deactivateSyllabusUseCase.execute(studentId, syllabusId);
}

export {
  getStudentSyllabusSubscription,
  listStudentSyllabusSubscriptions,
  listActiveStudentSyllabusSubscriptions,
  subscribeSyllabus,
  unsubscribeSyllabus,
  activateSyllabus,
  deactivateSyllabus
};
