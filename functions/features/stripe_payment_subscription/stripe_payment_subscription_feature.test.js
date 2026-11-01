const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CreateStripePaymentSubscription,
} = require("./application/create_stripe_payment_subscription");
const {
  GetStripeSubscriptionPaymentAction,
} = require(
  "./application/get_stripe_subscription_payment_action",
);
const {
  ProcessStripeSubscriptionEvent,
  normalizeInvoiceEvent,
} = require("./application/process_stripe_subscription_event");
const stripePaymentSubscriptionModule = require(
  "./stripe_payment_subscription_module",
);

function subscriptionInput(overrides = {}) {
  return {
    internalReference: "guardian-123",
    studentId: "student-123",
    customerReference: "cus_123",
    paymentMethodReference: "pm_123",
    country: "Malaysia",
    planId: "plan-quarterly",
    idempotencyReference: "checkout-attempt-123",
    ...overrides,
  };
}

function billingTerms() {
  return {
    stripeProductName: "RHX Quarterly Learning",
    amount: 4500,
    currency: "myr",
    interval: "month",
    intervalCount: 3,
  };
}

test("stripe subscription module exposes its application API", () => {
  assert.deepEqual(Object.keys(stripePaymentSubscriptionModule), [
    "cancelStripeStudentSubscription",
    "manageStripeRenewalRecovery",
    "getStripeGuardianSubscriptionOptions", "prepareStripeStudentSubscription", "createStripeStudentSubscription", "changeStripeStudentSubscriptionPlan",
    "createStripePaymentSubscription",
    "getStripeSubscriptionPaymentAction",
    "processStripeSubscriptionEvent",
    "retryStripeSubscriptionInvoicePayment",
    "getStripeSubscriptionPaymentDetails",
    "createStripeSubscriptionCardSetup",
    "updateStripeSubscriptionPaymentMethod",
    "processDueStripeRenewalRetries",
  ]);
});

test("resolves plan terms, creates, and persists a Stripe subscription", async () => {
  const calls = [];
  const useCase = new CreateStripePaymentSubscription({
    async getSubscriptionPlanBillingTerms(input) {
      calls.push(["get-billing-terms", input]);
      return billingTerms();
    },
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "test",
      paymentProvider: {
        async createSubscription(input) {
          calls.push(["create-subscription", input]);
          return {
            subscriptionReference: "sub_123",
            status: "incomplete",
            paymentClientSecret: "pi_subscription_secret_123",
          };
        },
        async retrieveSubscription(reference, options) {
          calls.push(["retrieve-subscription", reference, options]);
          return {subscriptionReference: "sub_123", customerReference: "cus_123",
            status: "incomplete", paymentClientSecret: "pi_current_secret_123"};
        },
      },
    }),
    getCustomerRecordByReference: async (input) => {
      calls.push(["get-customer", input]);
      return {
        customerReference: "cus_123",
        internalReference: "guardian-123",
      };
    },
    async getGuardianStudentLink(input) {
      calls.push(["get-guardian-student-link", input]);
      return {isActive: true};
    },
    async getStudentSubscription(studentId) {
      calls.push(["get-student-subscription", studentId]);
      return {studentId, subscriptionType: "trial"};
    },
    initializeSubscriptionRecord: async (input) => {
      calls.push(["initialize-subscription", input]);
      return {created: true, record: input};
    },
  });

  const result = await useCase.execute(subscriptionInput());

  assert.deepEqual(result, {
    subscriptionReference: "sub_123",
    status: "incomplete",
    paymentClientSecret: "pi_current_secret_123",
  });
  assert.deepEqual(calls, [
    ["get-billing-terms", {
      country: "Malaysia",
      planId: "plan-quarterly",
    }],
    ["get-customer", {
      mode: "test",
      customerReference: "cus_123",
    }],
    ["get-guardian-student-link", {
      guardianId: "guardian-123",
      studentId: "student-123",
    }],
    ["get-student-subscription", "student-123"],
    ["create-subscription", {
      customerReference: "cus_123",
      paymentMethodReference: "pm_123",
      stripeProductName: "RHX Quarterly Learning",
      amount: 4500,
      currency: "myr",
      interval: "month",
      intervalCount: 3,
      idempotencyReference: "checkout-attempt-123",
    }],
    ["initialize-subscription", {
      mode: "test",
      studentId: "student-123",
      planId: "plan-quarterly",
      customerReference: "cus_123",
      subscriptionReference: "sub_123",
      paymentMethodReference: "pm_123",
      status: "incomplete",
      amount: 4500,
      currency: "myr",
      interval: "month",
      intervalCount: 3,
      subscriptionStartDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      latestInvoiceReference: null,
      latestInvoiceStatus: null,
      latestPaymentStatus: null,
      paymentActionRequiredAt: null,
    }],
    ["retrieve-subscription", "sub_123", {includePaymentClientSecret: true, includeRecoveryDetails: true}],
  ]);
});

test("returns not-found when the country or plan is not configured", async () => {
  let providerCalls = 0;
  const useCase = new CreateStripePaymentSubscription({
    async getSubscriptionPlanBillingTerms() {
      return null;
    },
    async createPaymentProviderContext() {
      providerCalls += 1;
    },
    async getCustomerRecordByReference() {},
    async initializeSubscriptionRecord() {},
  });

  await assert.rejects(
    () => useCase.execute(subscriptionInput()),
    (error) => error.code === "not-found" && /not configured/.test(
      error.message,
    ),
  );
  assert.equal(providerCalls, 0);
});

test("rejects a Stripe customer owned by another authenticated user", async () => {
  let stripeCalls = 0;
  let linkReads = 0;
  const useCase = new CreateStripePaymentSubscription({
    async getSubscriptionPlanBillingTerms() {
      return billingTerms();
    },
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "test",
      paymentProvider: {
        async createSubscription() {
          stripeCalls += 1;
        },
      },
    }),
    async getCustomerRecordByReference() {
      return {internalReference: "another-guardian"};
    },
    async getGuardianStudentLink() {
      linkReads += 1;
    },
    async getStudentSubscription() {},
    async initializeSubscriptionRecord() {},
  });

  await assert.rejects(
    () => useCase.execute(subscriptionInput()),
    (error) => error.code === "not-found"
      && /not registered for this caller/.test(error.message),
  );
  assert.equal(linkReads, 0);
  assert.equal(stripeCalls, 0);
});

test("requires an active guardian-student link before calling Stripe", async () => {
  let stripeCalls = 0;
  const useCase = new CreateStripePaymentSubscription({
    async getSubscriptionPlanBillingTerms() {
      return billingTerms();
    },
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "test",
      paymentProvider: {
        async createSubscription() {
          stripeCalls += 1;
        },
      },
    }),
    async getCustomerRecordByReference() {
      return {internalReference: "guardian-123"};
    },
    async getGuardianStudentLink() {
      return {isActive: false};
    },
    async getStudentSubscription() {
      return {studentId: "student-123", subscriptionType: "trial"};
    },
    async initializeSubscriptionRecord() {},
  });

  await assert.rejects(
    () => useCase.execute(subscriptionInput()),
    (error) => error.code === "permission-denied",
  );
  assert.equal(stripeCalls, 0);
});

test("requires the Stripe customer to be registered for persistence", async () => {
  let subscriptionCalls = 0;
  const useCase = new CreateStripePaymentSubscription({
    async getSubscriptionPlanBillingTerms() {
      return billingTerms();
    },
    async createPaymentProviderContext() {
      return {
        providerName: "stripe",
        mode: "prod",
        paymentProvider: {
          async createSubscription() {
            subscriptionCalls += 1;
          },
        },
      };
    },
    async getCustomerRecordByReference() {
      return null;
    },
    async initializeSubscriptionRecord() {},
  });

  await assert.rejects(
    () => useCase.execute(subscriptionInput()),
    /is not registered in prod mode/,
  );
  assert.equal(subscriptionCalls, 0);
});

test("rejects a non-Stripe payment provider", async () => {
  const useCase = new CreateStripePaymentSubscription({
    async getSubscriptionPlanBillingTerms() {
      return billingTerms();
    },
    createPaymentProviderContext: async () => ({
      providerName: "other-provider",
      mode: "test",
      paymentProvider: {},
    }),
    async getCustomerRecordByReference() {},
    async initializeSubscriptionRecord() {},
  });

  await assert.rejects(
    () => useCase.execute(subscriptionInput()),
    /configured payment provider is not Stripe/,
  );
});

test("normalizes current and legacy subscription Invoice references", () => {
  const current = normalizeInvoiceEvent({
    data: {
      object: {
        id: "in_current",
        object: "invoice",
        customer: {id: "cus_current"},
        parent: {
          type: "subscription_details",
          subscription_details: {
            subscription: {id: "sub_current"},
          },
        },
      },
    },
  });
  const legacy = normalizeInvoiceEvent({
    data: {
      object: {
        id: "in_legacy",
        object: "invoice",
        customer: "cus_legacy",
        subscription: "sub_legacy",
      },
    },
  });

  assert.deepEqual(current, {
    invoiceReference: "in_current",
    customerReference: "cus_current",
    subscriptionReference: "sub_current",
  });
  assert.deepEqual(legacy, {
    invoiceReference: "in_legacy",
    customerReference: "cus_legacy",
    subscriptionReference: "sub_legacy",
  });
});

test("gets a current payment action only for its internal owner", async () => {
  const calls = [];
  const useCase = new GetStripeSubscriptionPaymentAction({
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "test",
      paymentProvider: {
        async retrieveSubscription(reference) {
          calls.push(["retrieve-subscription", reference]);
          return {subscriptionReference: "sub_owner", customerReference: "cus_owner",
            latestInvoiceReference: "in_action", status: "past_due",
            collectionMethod: "charge_automatically"};
        },
        async retrieveInvoicePaymentContext(reference) {
          calls.push(["retrieve-invoice-context", reference]);
          return {
            invoiceReference: "in_action",
            customerReference: "cus_owner",
            subscriptionReference: "sub_owner",
            invoiceStatus: "open",
            paymentStatus: "requires_action",
            paymentClientSecret: "pi_owner_secret",
            amountDue: 4500,
            amountRemaining: 4500,
            collectionMethod: "charge_automatically",
            currency: "myr",
          };
        },
      },
    }),
    async getCustomerRecordByInternalReference(input) {
      calls.push(["get-customer-by-internal-reference", input]);
      return {customerReference: "cus_owner"};
    },
    async getSubscriptionRecord(input) {
      calls.push(["get-subscription", input]);
      return {latestInvoiceReference: "in_action"};
    },
  });

  const result = await useCase.execute({
    internalReference: "firebase-user-123",
    subscriptionReference: "sub_owner",
  });

  assert.deepEqual(calls, [
    ["get-customer-by-internal-reference", {
      mode: "test",
      internalReference: "firebase-user-123",
    }],
    ["get-subscription", {
      mode: "test",
      customerReference: "cus_owner",
      subscriptionReference: "sub_owner",
    }],
    ["retrieve-subscription", "sub_owner"],
    ["retrieve-invoice-context", "in_action"],
  ]);
  assert.deepEqual(result, {
    action: "confirm_payment",
    subscriptionReference: "sub_owner",
    invoiceReference: "in_action",
    paymentStatus: "requires_action",
    paymentClientSecret: "pi_owner_secret",
    amountDue: 4500,
    currency: "myr",
    canRetry: false,
    savedCard: null,
    failureCode: null,
    invoiceStatus: "open",
    subscriptionStatus: "past_due",
    billingReason: null,
    canPayWithNewCard: false,
    paymentState: "authentication_required",
    nextPaymentAttemptAt: null,
    studentId: null,
    planId: null,
  });
});

test("does not expose a subscription owned by another caller", async () => {
  let subscriptionReads = 0;
  let stripeReads = 0;
  const useCase = new GetStripeSubscriptionPaymentAction({
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "prod",
      paymentProvider: {
        async retrieveInvoicePaymentContext() {
          stripeReads += 1;
        },
      },
    }),
    async getCustomerRecordByInternalReference() {
      return null;
    },
    async getSubscriptionRecord() {
      subscriptionReads += 1;
    },
  });

  await assert.rejects(
    () => useCase.execute({
      internalReference: "other-user",
      subscriptionReference: "sub_private",
    }),
    (error) => error.code === "not-found",
  );
  assert.equal(subscriptionReads, 0);
  assert.equal(stripeReads, 0);
});
