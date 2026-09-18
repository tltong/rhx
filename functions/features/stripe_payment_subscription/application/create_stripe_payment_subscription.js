function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function normalizeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(
      "The Stripe payment provider did not return subscription details.",
    );
  }

  const paymentClientSecret = String(
    result.paymentClientSecret ?? "",
  ).trim() || null;

  return Object.freeze({
    subscriptionReference: requireText(
      result.subscriptionReference,
      "subscriptionReference",
    ),
    status: requireText(result.status, "status"),
    paymentClientSecret,
  });
}

function planNotFound() {
  const error = new Error(
    "The subscription plan is not configured for the selected country.",
  );
  error.code = "not-found";
  return error;
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

class CreateStripePaymentSubscription {
  constructor({
    createPaymentProviderContext,
    getCustomerRecordByReference,
    getGuardianStudentLink,
    getStudentSubscription,
    getSubscriptionPlanBillingTerms,
    writeSubscriptionRecord,
  }) {
    this.createPaymentProviderContext = createPaymentProviderContext;
    this.getCustomerRecordByReference = getCustomerRecordByReference;
    this.getGuardianStudentLink = getGuardianStudentLink;
    this.getStudentSubscription = getStudentSubscription;
    this.getSubscriptionPlanBillingTerms =
      getSubscriptionPlanBillingTerms;
    this.writeSubscriptionRecord = writeSubscriptionRecord;
  }

  async execute(input = {}) {
    const internalReference = requireText(
      input.internalReference,
      "internalReference",
    );
    const studentId = requireText(input.studentId, "studentId");
    const customerReference = requireText(
      input.customerReference,
      "customerReference",
    );
    const paymentMethodReference = requireText(
      input.paymentMethodReference,
      "paymentMethodReference",
    );
    const country = requireText(input.country, "country");
    const planId = requireText(input.planId, "planId");
    const idempotencyReference = requireText(
      input.idempotencyReference,
      "idempotencyReference",
    );
    const billingTerms = await this.getSubscriptionPlanBillingTerms({
      country,
      planId,
    });

    if (!billingTerms) {
      throw planNotFound();
    }

    const {
      providerName,
      mode,
      paymentProvider,
    } = await this.createPaymentProviderContext();

    if (providerName !== "stripe") {
      throw new Error("The configured payment provider is not Stripe.");
    }

    if (typeof paymentProvider?.createSubscription !== "function") {
      throw new Error(
        "The configured Stripe payment provider cannot create subscriptions.",
      );
    }

    const customerRecord = await this.getCustomerRecordByReference({
      mode,
      customerReference,
    });

    if (!customerRecord) {
      throw codedError(
        "not-found",
        `Stripe customer ${customerReference} is not registered in ${mode} mode.`,
      );
    }

    if (customerRecord.internalReference !== internalReference) {
      throw codedError(
        "not-found",
        `Stripe customer ${customerReference} is not registered for this caller.`,
      );
    }

    const [guardianStudentLink, studentSubscription] = await Promise.all([
      this.getGuardianStudentLink({
        guardianId: internalReference,
        studentId,
      }),
      this.getStudentSubscription(studentId),
    ]);

    if (!guardianStudentLink?.isActive) {
      throw codedError(
        "permission-denied",
        "The signed-in guardian does not have an active link to this student.",
      );
    }

    if (!studentSubscription) {
      throw codedError(
        "not-found",
        `Subscription for student ${studentId} was not found.`,
      );
    }

    const subscription = normalizeResult(
      await paymentProvider.createSubscription({
        customerReference,
        paymentMethodReference,
        ...billingTerms,
        idempotencyReference,
      }),
    );

    await this.writeSubscriptionRecord({
      mode,
      studentId,
      planId,
      customerReference,
      subscriptionReference: subscription.subscriptionReference,
      paymentMethodReference,
      status: subscription.status,
      amount: billingTerms.amount,
      currency: billingTerms.currency,
      interval: billingTerms.interval,
      intervalCount: billingTerms.intervalCount,
      subscriptionStartDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      latestInvoiceReference: null,
      latestInvoiceStatus: null,
      latestPaymentStatus: null,
      paymentActionRequiredAt: null,
    });

    return subscription;
  }
}

module.exports = {
  CreateStripePaymentSubscription,
  normalizeResult,
};
