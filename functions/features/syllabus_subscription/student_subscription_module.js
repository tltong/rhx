/**
 * Internal Functions APIs:
 *
 * getStudentSubscription(studentId)
 * createStudentSubscription(input)
 * updateStudentSubscription({studentId, ...changes})
 * linkStudentPaymentSubscription({
 *   studentId, activeUntil?, paymentCustomerReference,
 *   paymentSubscriptionReference, planId
 * })
 *
 * linkStudentPaymentSubscription reads paymentProvider and paymentMode from
 * paymentConfigs/default during execution; callers do not supply them.
 */
const {
  getPaymentConfig,
} = require("../payment/payment_module");
const {
  CreateStudentSubscription,
} = require("./application/create_student_subscription");
const {
  GetStudentSubscription,
} = require("./application/get_student_subscription");
const {
  LinkStudentPaymentSubscription,
} = require("./application/link_student_payment_subscription");
const {
  UpdateStudentSubscription,
} = require("./application/update_student_subscription");
const {
  paymentModes,
  paymentProviders,
  subscriptionTypes,
} = require("./domain/student_subscription");
const {
  FirestoreStudentSubscriptionRepository,
} = require(
  "./infrastructure/firestore_student_subscription_repository",
);

const studentSubscriptionRepository =
  new FirestoreStudentSubscriptionRepository();
const createStudentSubscriptionUseCase =
  new CreateStudentSubscription(studentSubscriptionRepository);
const getStudentSubscriptionUseCase =
  new GetStudentSubscription(studentSubscriptionRepository);
const updateStudentSubscriptionUseCase =
  new UpdateStudentSubscription(studentSubscriptionRepository);
const linkStudentPaymentSubscriptionUseCase =
  new LinkStudentPaymentSubscription({
    getPaymentConfig,
    studentSubscriptionRepository,
  });

async function createStudentSubscription(input) {
  return createStudentSubscriptionUseCase.execute(input);
}

async function getStudentSubscription(studentId) {
  return getStudentSubscriptionUseCase.execute(studentId);
}

async function updateStudentSubscription(input) {
  return updateStudentSubscriptionUseCase.execute(input);
}

async function linkStudentPaymentSubscription(input) {
  return linkStudentPaymentSubscriptionUseCase.execute(input);
}

module.exports = {
  createStudentSubscription,
  getStudentSubscription,
  linkStudentPaymentSubscription,
  paymentModes,
  paymentProviders,
  subscriptionTypes,
  updateStudentSubscription,
};
