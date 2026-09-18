const {
  subscriptionTypes,
} = require("../domain/student_subscription");

class LinkStudentPaymentSubscription {
  constructor({
    getPaymentConfig,
    studentSubscriptionRepository,
  }) {
    this.getPaymentConfig = getPaymentConfig;
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute({
    studentId,
    activeUntil = null,
    paymentCustomerReference,
    paymentSubscriptionReference,
    planId,
  }) {
    const [paymentConfig, subscription] = await Promise.all([
      this.getPaymentConfig(),
      this.studentSubscriptionRepository.getSubscription(studentId),
    ]);

    if (!paymentConfig) {
      const error = new Error("Payment configuration is not available.");
      error.code = "failed-precondition";
      throw error;
    }

    if (!subscription) {
      const error = new Error(
        `Subscription for student ${studentId} was not found.`,
      );
      error.code = "not-found";
      throw error;
    }

    subscription.update({
      subscriptionType: subscriptionTypes.ONGOING,
      activeUntil,
      paymentProvider: paymentConfig.provider,
      paymentMode: paymentConfig.mode,
      paymentCustomerReference,
      paymentSubscriptionReference,
      planId,
    });

    return this.studentSubscriptionRepository.saveSubscription(subscription);
  }
}

module.exports = {
  LinkStudentPaymentSubscription,
};
