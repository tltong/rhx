import {
  FirestoreSyllabusSubscriptionRepository
} from "./infrastructure/firestore_syllabus_subscription_repository.js?v=20260726-subscription-language";
import {
  GetStudentSyllabusSubscription
} from "./application/get_student_syllabus_subscription.js?v=20260726-subscription-language";
import {
  GetStudentSyllabusSubscriptionLanguage
} from "./application/get_student_syllabus_subscription_language.js?v=20260815-language-lookup";
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
  ListAvailableSyllabusesForStudent
} from "./application/list_available_syllabuses_for_student.js?v=20260823-student-syllabus-availability-v1";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260726-subscription-language";
import {
  getStudentById
} from "../student/student_module.js?v=20260823-student-country-v1";
import {
  getStudentStreamSubscription
} from "../stream_subscription/stream_subscription_module.js?v=20260823-student-stream-v1";
import {
  getStreamById
} from "../stream/stream_module.js?v=20260823-student-standard-stream-v1";

const syllabusSubscriptionRepository =
  new FirestoreSyllabusSubscriptionRepository();
const getStudentSyllabusSubscriptionUseCase =
  new GetStudentSyllabusSubscription(syllabusSubscriptionRepository);
const getStudentSyllabusSubscriptionLanguageUseCase =
  new GetStudentSyllabusSubscriptionLanguage(
    syllabusSubscriptionRepository
  );
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
const listAvailableSyllabusesForStudentUseCase =
  new ListAvailableSyllabusesForStudent({
    getStudentById,
    getStudentStreamSubscription,
    getStreamById
  });

async function getStudentSyllabusSubscription(studentId, syllabusId) {
  return getStudentSyllabusSubscriptionUseCase.execute(studentId, syllabusId);
}

/**
 * @param {string} studentId
 * @param {string} syllabusId
 * @returns {Promise<string|null>}
 */
async function getStudentSyllabusSubscriptionLanguage(
  studentId,
  syllabusId
) {
  return getStudentSyllabusSubscriptionLanguageUseCase.execute(
    studentId,
    syllabusId
  );
}

async function listStudentSyllabusSubscriptions(studentId) {
  return listStudentSyllabusSubscriptionsUseCase.execute(studentId);
}

async function listActiveStudentSyllabusSubscriptions(studentId) {
  return listActiveStudentSyllabusSubscriptionsUseCase.execute(studentId);
}

/**
 * @param {string} studentId
 * @returns {Promise<Array<{syllabusId: string, language: string}>>}
 */
async function listAvailableSyllabusesForStudent(studentId) {
  return listAvailableSyllabusesForStudentUseCase.execute(studentId);
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
  getStudentSyllabusSubscriptionLanguage,
  listStudentSyllabusSubscriptions,
  listActiveStudentSyllabusSubscriptions,
  listAvailableSyllabusesForStudent,
  subscribeSyllabus,
  unsubscribeSyllabus,
  activateSyllabus,
  deactivateSyllabus
};

export {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionPlan,
  getSubscriptionPlanCatalog,
  listSubscriptionPlans,
  setSubscriptionPlanCurrency,
  updateSubscriptionPlan
} from "./subscription_plan_module.js?v=20260912-stripe-product-name-v1";

export {
  createStudentSubscription,
  getStudentSubscription,
  getSubscriptionPayment,
  listSubscriptionPayments,
  recordSubscriptionPayment,
  subscriptionTypes,
  updateStudentSubscription
} from "./student_subscription_module.js?v=20260829-student-subscriptions-v1";
