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
    paymentProvider,
    paymentMode,
    billingPeriodEnd = null,
  }) {
    const explicitContext = paymentProvider != null || paymentMode != null;
    if (explicitContext && (!paymentProvider || !paymentMode)) {
      throw Object.assign(Error("Provider and mode must be supplied together."), {code: "invalid-argument"});
    }
    const [paymentConfig, subscription] = await Promise.all([
      explicitContext ? {provider: paymentProvider, mode: paymentMode} : this.getPaymentConfig(),
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
    if (explicitContext && subscription.paymentMode === "prod" && paymentMode === "test") {
      throw Object.assign(Error("Test payment cannot replace production access."), {code: "failed-precondition"});
    }
    if (explicitContext) {
      const paidEnd = billingPeriodEnd || activeUntil;
      const date = value => value instanceof Date ? value : value?.toDate?.();
      if (!date(paidEnd) || !Number.isFinite(date(paidEnd).getTime())) {
        throw Object.assign(Error("Verified paid coverage is required."), {code: "failed-precondition"});
      }
      const previous = date(subscription.activeUntil);
      activeUntil = subscription.paymentMode === "test" && paymentMode === "prod" ? paidEnd
        : previous && previous > date(paidEnd) ? subscription.activeUntil : paidEnd;
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
