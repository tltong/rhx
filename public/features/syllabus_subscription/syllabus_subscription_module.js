import {
  FirestoreSyllabusSubscriptionRepository
} from "./infrastructure/firestore_syllabus_subscription_repository.js?v=20260726-subscription-language";
import {
  GetStudentSyllabusSubscription
} from "./application/get_student_syllabus_subscription.js?v=20260726-subscription-language";
import {
  ListStudentSyllabusSubscriptions
} from "./application/list_student_syllabus_subscriptions.js?v=20260726-subscription-language";
import {
  ListActiveStudentSyllabusSubscriptions
} from "./application/list_active_student_syllabus_subscriptions.js?v=20260726-subscription-language";
import {
  SubscribeSyllabus
} from "./application/subscribe_syllabus.js?v=20260726-subscription-language";
import {
  UnsubscribeSyllabus
} from "./application/unsubscribe_syllabus.js?v=20260726-subscription-language";
import {
  ActivateSyllabus
} from "./application/activate_syllabus.js?v=20260726-subscription-language";
import {
  DeactivateSyllabus
} from "./application/deactivate_syllabus.js?v=20260726-subscription-language";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260726-subscription-language";

const syllabusSubscriptionRepository =
  new FirestoreSyllabusSubscriptionRepository();
const getStudentSyllabusSubscriptionUseCase =
  new GetStudentSyllabusSubscription(syllabusSubscriptionRepository);
const listStudentSyllabusSubscriptionsUseCase =
  new ListStudentSyllabusSubscriptions(syllabusSubscriptionRepository);
const listActiveStudentSyllabusSubscriptionsUseCase =
  new ListActiveStudentSyllabusSubscriptions(syllabusSubscriptionRepository);
const subscribeSyllabusUseCase =
  new SubscribeSyllabus({
    syllabusSubscriptionRepository,
    getSyllabusById
  });
const unsubscribeSyllabusUseCase =
  new UnsubscribeSyllabus(syllabusSubscriptionRepository);
const activateSyllabusUseCase =
  new ActivateSyllabus({
    syllabusSubscriptionRepository,
    getSyllabusById
  });
const deactivateSyllabusUseCase =
  new DeactivateSyllabus({
    syllabusSubscriptionRepository,
    getSyllabusById
  });

async function getStudentSyllabusSubscription(studentId, syllabusId) {
  return getStudentSyllabusSubscriptionUseCase.execute(studentId, syllabusId);
}

async function listStudentSyllabusSubscriptions(studentId) {
  return listStudentSyllabusSubscriptionsUseCase.execute(studentId);
}

async function listActiveStudentSyllabusSubscriptions(studentId) {
  return listActiveStudentSyllabusSubscriptionsUseCase.execute(studentId);
}

async function subscribeSyllabus(studentId, syllabusId, language) {
  return subscribeSyllabusUseCase.execute(
    studentId,
    syllabusId,
    language
  );
}

async function unsubscribeSyllabus(studentId, syllabusId) {
  return unsubscribeSyllabusUseCase.execute(studentId, syllabusId);
}

async function activateSyllabus(studentId, syllabusId, language) {
  return activateSyllabusUseCase.execute(
    studentId,
    syllabusId,
    language
  );
}

async function deactivateSyllabus(studentId, syllabusId, language) {
  return deactivateSyllabusUseCase.execute(
    studentId,
    syllabusId,
    language
  );
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
