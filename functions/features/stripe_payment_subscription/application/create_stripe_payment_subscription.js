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
    initializeSubscriptionRecord,
    initializeInvoiceRecord,
    getStudentSubscriptionCheckout,
    claimStudentSubscriptionCheckout,
    completeStudentSubscriptionCheckout,
    listSubscriptionRecords,
    now = () => new Date(),
  }) {
    this.createPaymentProviderContext = createPaymentProviderContext;
    this.getCustomerRecordByReference = getCustomerRecordByReference;
    this.getGuardianStudentLink = getGuardianStudentLink;
    this.getStudentSubscription = getStudentSubscription;
    this.getSubscriptionPlanBillingTerms =
      getSubscriptionPlanBillingTerms;
    this.initializeSubscriptionRecord = initializeSubscriptionRecord;
    this.initializeInvoiceRecord = initializeInvoiceRecord;
    Object.assign(this, {getStudentSubscriptionCheckout, claimStudentSubscriptionCheckout,
      completeStudentSubscriptionCheckout, listSubscriptionRecords});
    this.now = now;
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
    let paymentMethodReference = requireText(
      input.paymentMethodReference,
      "paymentMethodReference",
    );
    const country = requireText(input.country, "country");
    const planId = requireText(input.planId, "planId");
    let idempotencyReference = requireText(
      input.idempotencyReference,
      "idempotencyReference",
    );
    let billingTerms = input.billingTermsSnapshot || await this.getSubscriptionPlanBillingTerms({
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

    let reservedSubscriptionReference = null;
    let billingStartsAt = null;
    if (this.claimStudentSubscriptionCheckout) {
      const stored = await this.getStudentSubscriptionCheckout({studentId, mode});
      const records = await this.listSubscriptionRecords({mode, customerReference});
      const references = new Set(records.filter(record => record.studentId === studentId).map(record => record.subscriptionReference));
      if (stored?.subscriptionReference) references.add(stored.subscriptionReference);
      if (studentSubscription.paymentProvider === "stripe" && studentSubscription.paymentMode === mode) {
        references.add(studentSubscription.paymentSubscriptionReference);
      }
      let allowedPreviousReference = null, replacePrevious = false;
      for (const reference of references) {
        if (!reference) continue;
        let live;
        try {live = await paymentProvider.retrieveSubscription(reference, {includeRecoveryDetails: true});}
        catch (error) {if (error.code !== "resource_missing") throw error;}
        const terminal = !live || ["canceled", "incomplete_expired"].includes(live.status);
        const replay = stored?.subscriptionReference === reference && stored.requestReference === idempotencyReference;
        if (!terminal && !replay) throw codedError("failed-precondition", "This student already has a subscription. Open it to continue.");
        if (reference === studentSubscription.paymentSubscriptionReference || reference === stored?.subscriptionReference) {
          allowedPreviousReference = reference; replacePrevious = terminal && !replay;
        }
      }
      const checkout = await this.claimStudentSubscriptionCheckout({studentId, mode, internalReference,
        customerReference, paymentMethodReference, country, planId, billingTerms, idempotencyReference,
        allowedPreviousReference, replacePrevious});
      ({paymentMethodReference, billingTerms, idempotencyReference} = checkout);
      reservedSubscriptionReference = checkout.subscriptionReference;
      billingStartsAt = checkout.billingStartsAt?.toDate?.() || checkout.billingStartsAt || null;
    }

    const subscription = normalizeResult(
      reservedSubscriptionReference ? await paymentProvider.retrieveSubscription(reservedSubscriptionReference,
        {includePaymentClientSecret: true, includeRecoveryDetails: true}) : await paymentProvider.createSubscription({
        customerReference,
        paymentMethodReference,
        ...billingTerms,
        ...(billingStartsAt ? {billingStartsAt} : {}),
        idempotencyReference,
      }),
    );

    if (this.completeStudentSubscriptionCheckout) {
      await this.completeStudentSubscriptionCheckout({studentId, mode, internalReference, idempotencyReference,
        subscriptionReference: subscription.subscriptionReference});
    }

    const initialized = await this.initializeSubscriptionRecord({
      mode,
      studentId,
      planId,
      customerReference,
      subscriptionReference: subscription.subscriptionReference,
      paymentMethodReference,
      ...(billingStartsAt ? {billingStartsAt} : {}),
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

    // An idempotent Stripe create response can predate a successful payment.
    // Always refresh: a retry can also be the first request to persist the
    // record after a partial failure. Never rewrite webhook state here.
    if (typeof paymentProvider.retrieveSubscription !== "function") {
      throw new Error(
        "The configured Stripe payment provider cannot retrieve subscriptions.",
      );
    }
    const observedAt = this.now();
    const current = await paymentProvider.retrieveSubscription(
      subscription.subscriptionReference,
      {includePaymentClientSecret: true, includeRecoveryDetails: true},
    );
    const result = normalizeResult(current);

    if (result.subscriptionReference !== subscription.subscriptionReference
      || current.customerReference !== customerReference) {
      throw new Error(
        "Stripe returned subscription details for a different customer " +
        "or subscription.",
      );
    }

    if (current.latestInvoiceReference) {
      const context = await paymentProvider.retrieveInvoicePaymentContext(
        current.latestInvoiceReference, {includeBillingDetails: true});
      if (context.invoiceReference !== current.latestInvoiceReference
        || context.customerReference !== customerReference
        || context.subscriptionReference !== current.subscriptionReference) {
        throw Error("Stripe returned an unexpected initial invoice.");
      }
      const {invoiceRecord} = require("./stripe_invoice_record");
      const invoiceInitialized = await this.initializeInvoiceRecord({studentId, paymentProvider: "stripe", paymentMode: mode,
        paymentSubscriptionReference: current.subscriptionReference,
        invoiceRecord: invoiceRecord({context, subscription: current, customer: customerRecord,
          registered: initialized.record, observedAt})});
      if (invoiceInitialized.invoiceRecord.paymentState === "paid" && result.status === "incomplete") {
        const refreshed = await paymentProvider.retrieveSubscription(current.subscriptionReference,
          {includePaymentClientSecret: true, includeRecoveryDetails: true});
        if (refreshed.customerReference !== customerReference || refreshed.subscriptionReference !== current.subscriptionReference) {
          throw Error("Stripe returned an unexpected paid subscription.");
        }
        return {...normalizeResult(refreshed), paymentClientSecret: null};
      }
    }
    return result;
  }
}

module.exports = {
  CreateStripePaymentSubscription,
  normalizeResult,
};
