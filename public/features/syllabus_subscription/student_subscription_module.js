/**
 * Public APIs:
 *
 * getStudentSubscription(studentId)
 *   -> Promise<StudentSubscription|null>
 * createStudentSubscription({studentId, subscriptionType, activeUntil?})
 *   -> Promise<StudentSubscription>
 * updateStudentSubscription({studentId, subscriptionType?, activeUntil?})
 *   -> Promise<StudentSubscription>
 * getSubscriptionPayment(studentId, paymentId)
 *   -> Promise<SubscriptionPayment|null>
 * listSubscriptionPayments(studentId)
 *   -> Promise<SubscriptionPayment[]>
 * recordSubscriptionPayment({
 *   studentId, guardianId, planId, durationMonths, amountPaid, currency,
 *   paymentDate, paymentProvider, paymentProviderReference
 * }) -> Promise<SubscriptionPayment>
 */
import {
  CreateStudentSubscription
} from "./application/create_student_subscription.js?v=20260829-student-subscriptions-v1";
import {
  GetStudentSubscription
} from "./application/get_student_subscription.js?v=20260829-student-subscriptions-v1";
import {
  GetSubscriptionPayment
} from "./application/get_subscription_payment.js?v=20260829-student-subscriptions-v1";
import {
  ListSubscriptionPayments
} from "./application/list_subscription_payments.js?v=20260829-student-subscriptions-v1";
import {
  RecordSubscriptionPayment
} from "./application/record_subscription_payment.js?v=20260829-student-subscriptions-v1";
import {
  UpdateStudentSubscription
} from "./application/update_student_subscription.js?v=20260829-student-subscriptions-v1";
import {
  guardianStudentLinkStates,
  getGuardianStudentLink
} from "../guardian_student_link/guardian_student_link_module.js?v=20260829-student-subscriptions-v1";
import {
  getStudentById
} from "../student/student_module.js?v=20260829-student-subscriptions-v1";
import {
  FirestoreStudentSubscriptionRepository
} from "./infrastructure/firestore_student_subscription_repository.js?v=20260829-student-subscriptions-v1";
import {
  getSubscriptionPlan,
  getSubscriptionPlanCatalog
} from "./subscription_plan_module.js?v=20260829-subscription-plans-v1";
import {
  subscriptionTypes
} from "./domain/student_subscription.js?v=20260829-student-subscriptions-v1";

const studentSubscriptionRepository =
  new FirestoreStudentSubscriptionRepository();
const getStudentSubscriptionUseCase =
  new GetStudentSubscription(studentSubscriptionRepository);
const createStudentSubscriptionUseCase =
  new CreateStudentSubscription(studentSubscriptionRepository);
const updateStudentSubscriptionUseCase =
  new UpdateStudentSubscription(studentSubscriptionRepository);
const getSubscriptionPaymentUseCase =
  new GetSubscriptionPayment(studentSubscriptionRepository);
const listSubscriptionPaymentsUseCase =
  new ListSubscriptionPayments(studentSubscriptionRepository);
const recordSubscriptionPaymentUseCase = new RecordSubscriptionPayment({
  studentSubscriptionRepository,
  getGuardianStudentLink,
  guardianStudentLinkStates,
  getStudentById,
  getSubscriptionPlan,
  getSubscriptionPlanCatalog
});

async function getStudentSubscription(studentId) {
  return getStudentSubscriptionUseCase.execute(studentId);
}

async function createStudentSubscription(input) {
  return createStudentSubscriptionUseCase.execute(input);
}

async function updateStudentSubscription(input) {
  return updateStudentSubscriptionUseCase.execute(input);
}

async function getSubscriptionPayment(studentId, paymentId) {
  return getSubscriptionPaymentUseCase.execute(studentId, paymentId);
}

async function listSubscriptionPayments(studentId) {
  return listSubscriptionPaymentsUseCase.execute(studentId);
}

async function recordSubscriptionPayment(input) {
  return recordSubscriptionPaymentUseCase.execute(input);
}

export {
  createStudentSubscription,
  getStudentSubscription,
  getSubscriptionPayment,
  listSubscriptionPayments,
  recordSubscriptionPayment,
  subscriptionTypes,
  updateStudentSubscription
};
