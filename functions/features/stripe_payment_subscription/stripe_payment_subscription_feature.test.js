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
    "createStripePaymentSubscription",
    "getStripeSubscriptionPaymentAction",
    "processStripeSubscriptionEvent",
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
      },
    }),
    getCustomerRecordByReference: async (input) => {
      calls.push(["get-customer", input]);
      return {
        customerReference: "cus_123",
        internalReference: "a-different-caller",
      };
    },
    writeSubscriptionRecord: async (input) => {
      calls.push(["write-subscription", input]);
    },
  });

  const result = await useCase.execute(subscriptionInput());

  assert.deepEqual(result, {
    subscriptionReference: "sub_123",
    status: "incomplete",
    paymentClientSecret: "pi_subscription_secret_123",
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
    ["write-subscription", {
      mode: "test",
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
    async writeSubscriptionRecord() {},
  });

  await assert.rejects(
    () => useCase.execute(subscriptionInput()),
    (error) => error.code === "not-found" && /not configured/.test(
      error.message,
    ),
  );
  assert.equal(providerCalls, 0);
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
    async writeSubscriptionRecord() {},
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
    async writeSubscriptionRecord() {},
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

test("processes invoice.paid using current Stripe subscription state", async () => {
  const calls = [];
  const subscriptionStartDate = new Date("2026-09-01T00:00:00.000Z");
  const currentPeriodStart = new Date("2026-09-01T00:00:00.000Z");
  const currentPeriodEnd = new Date("2026-10-01T00:00:00.000Z");
  const useCase = new ProcessStripeSubscriptionEvent({
    createStripePayment(input) {
      calls.push(["create-stripe-payment", input]);
      return {
        async retrieveSubscription(reference) {
          calls.push(["retrieve-subscription", reference]);
          return {
            subscriptionReference: "sub_123",
            customerReference: "cus_123",
            status: "active",
            subscriptionStartDate,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
          };
        },
      };
    },
    async getSubscriptionRecord(input) {
      calls.push(["get-subscription", input]);
      return {
        paymentMethodReference: "pm_123",
        amount: 4500,
        currency: "myr",
        interval: "month",
        intervalCount: 3,
      };
    },
    async writeSubscriptionRecord(input) {
      calls.push(["write-subscription", input]);
    },
  });

  const result = await useCase.execute({
    mode: "test",
    event: {
      type: "invoice.paid",
      data: {
        object: {
          id: "in_123",
          object: "invoice",
          customer: "cus_123",
          parent: {
            type: "subscription_details",
            subscription_details: {
              subscription: "sub_123",
            },
          },
        },
      },
    },
  });

  assert.deepEqual(calls, [
    ["create-stripe-payment", {mode: "test"}],
    ["retrieve-subscription", "sub_123"],
    ["get-subscription", {
      mode: "test",
      customerReference: "cus_123",
      subscriptionReference: "sub_123",
    }],
    ["write-subscription", {
      mode: "test",
      customerReference: "cus_123",
      subscriptionReference: "sub_123",
      paymentMethodReference: "pm_123",
      status: "active",
      amount: 4500,
      currency: "myr",
      interval: "month",
      intervalCount: 3,
      subscriptionStartDate,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      latestInvoiceReference: "in_123",
      latestInvoiceStatus: "paid",
      latestPaymentStatus: "succeeded",
      paymentActionRequiredAt: null,
    }],
  ]);
  assert.deepEqual(result, {
    handled: true,
    eventType: "invoice.paid",
    mode: "test",
    invoiceReference: "in_123",
    customerReference: "cus_123",
    subscriptionReference: "sub_123",
    status: "active",
    subscriptionStartDate,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    latestInvoiceStatus: "paid",
    latestPaymentStatus: "succeeded",
    paymentActionRequiredAt: null,
  });
});

test("records an Invoice payment action without persisting its secret", async () => {
  const calls = [];
  const actionRequiredAt = new Date("2026-09-14T01:02:03.000Z");
  const subscriptionStartDate = new Date("2026-09-01T00:00:00.000Z");
  const currentPeriodStart = new Date("2026-09-01T00:00:00.000Z");
  const currentPeriodEnd = new Date("2026-10-01T00:00:00.000Z");
  const useCase = new ProcessStripeSubscriptionEvent({
    createStripePayment(input) {
      calls.push(["create-stripe-payment", input]);
      return {
        async retrieveInvoicePaymentContext(reference) {
          calls.push(["retrieve-invoice-context", reference]);
          return {
            invoiceReference: "in_action",
            customerReference: "cus_123",
            subscriptionReference: "sub_123",
            invoiceStatus: "open",
            paymentStatus: "requires_action",
            paymentClientSecret: "pi_secret_must_not_be_stored",
          };
        },
        async retrieveSubscription(reference) {
          calls.push(["retrieve-subscription", reference]);
          return {
            subscriptionReference: "sub_123",
            customerReference: "cus_123",
            status: "past_due",
            subscriptionStartDate,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
          };
        },
      };
    },
    async getSubscriptionRecord(input) {
      calls.push(["get-subscription", input]);
      return {
        paymentMethodReference: "pm_123",
        amount: 4500,
        currency: "myr",
        interval: "month",
        intervalCount: 3,
        paymentActionRequiredAt: null,
      };
    },
    async writeSubscriptionRecord(input) {
      calls.push(["write-subscription", input]);
    },
    now: () => actionRequiredAt,
  });

  const result = await useCase.execute({
    mode: "test",
    event: {
      type: "invoice.payment_action_required",
      data: {
        object: {
          id: "in_action",
          object: "invoice",
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    },
  });
  const write = calls.find(([operation]) => (
    operation === "write-subscription"
  ))[1];

  assert.deepEqual(calls.slice(0, 4), [
    ["create-stripe-payment", {mode: "test"}],
    ["retrieve-invoice-context", "in_action"],
    ["retrieve-subscription", "sub_123"],
    ["get-subscription", {
      mode: "test",
      customerReference: "cus_123",
      subscriptionReference: "sub_123",
    }],
  ]);
  assert.deepEqual(write, {
    mode: "test",
    customerReference: "cus_123",
    subscriptionReference: "sub_123",
    paymentMethodReference: "pm_123",
    status: "past_due",
    amount: 4500,
    currency: "myr",
    interval: "month",
    intervalCount: 3,
    subscriptionStartDate,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    latestInvoiceReference: "in_action",
    latestInvoiceStatus: "open",
    latestPaymentStatus: "requires_action",
    paymentActionRequiredAt: actionRequiredAt,
  });
  assert.equal("paymentClientSecret" in write, false);
  assert.deepEqual(result, {
    handled: true,
    eventType: "invoice.payment_action_required",
    mode: "test",
    invoiceReference: "in_action",
    customerReference: "cus_123",
    subscriptionReference: "sub_123",
    status: "past_due",
    subscriptionStartDate,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    latestInvoiceStatus: "open",
    latestPaymentStatus: "requires_action",
    paymentActionRequiredAt: actionRequiredAt,
  });
  assert.equal("paymentClientSecret" in result, false);
});

test("does not restore action-required state after the Invoice is paid", async () => {
  let write;
  const useCase = new ProcessStripeSubscriptionEvent({
    createStripePayment: () => ({
      async retrieveInvoicePaymentContext() {
        return {
          invoiceReference: "in_stale_action",
          customerReference: "cus_123",
          subscriptionReference: "sub_123",
          invoiceStatus: "paid",
          paymentStatus: "succeeded",
        };
      },
      async retrieveSubscription() {
        return {
          subscriptionReference: "sub_123",
          customerReference: "cus_123",
          status: "active",
          subscriptionStartDate: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      },
    }),
    async getSubscriptionRecord() {
      return {
        paymentMethodReference: "pm_123",
        amount: 4500,
        currency: "myr",
        interval: "month",
        intervalCount: 3,
        paymentActionRequiredAt:
          new Date("2026-09-13T00:00:00.000Z"),
      };
    },
    async writeSubscriptionRecord(input) {
      write = input;
    },
  });

  await useCase.execute({
    mode: "test",
    event: {
      type: "invoice.payment_action_required",
      data: {
        object: {
          id: "in_stale_action",
          object: "invoice",
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    },
  });

  assert.equal(write.latestInvoiceStatus, "paid");
  assert.equal(write.latestPaymentStatus, "succeeded");
  assert.equal(write.paymentActionRequiredAt, null);
});

test("gets a current payment action only for its internal owner", async () => {
  const calls = [];
  const useCase = new GetStripeSubscriptionPaymentAction({
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "test",
      paymentProvider: {
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

test("rejects an Invoice and Subscription customer mismatch", async () => {
  let persistenceCalls = 0;
  const useCase = new ProcessStripeSubscriptionEvent({
    createStripePayment: () => ({
      async retrieveSubscription() {
        return {
          subscriptionReference: "sub_123",
          customerReference: "cus_other",
          status: "active",
        };
      },
    }),
    async getSubscriptionRecord() {
      persistenceCalls += 1;
    },
    async writeSubscriptionRecord() {
      persistenceCalls += 1;
    },
  });

  await assert.rejects(
    () => useCase.execute({
      mode: "prod",
      event: {
        type: "invoice.paid",
        data: {
          object: {
            id: "in_123",
            object: "invoice",
            customer: "cus_123",
            subscription: "sub_123",
          },
        },
      },
    }),
    /Subscription customer does not match Invoice customer/,
  );
  assert.equal(persistenceCalls, 0);
});

test("ignores unsupported and non-subscription Invoice events", async () => {
  let stripeCalls = 0;
  const useCase = new ProcessStripeSubscriptionEvent({
    createStripePayment() {
      stripeCalls += 1;
    },
    async getSubscriptionRecord() {},
    async writeSubscriptionRecord() {},
  });

  assert.deepEqual(await useCase.execute({
    mode: "test",
    event: {type: "invoice.payment_failed"},
  }), {
    handled: false,
    eventType: "invoice.payment_failed",
  });
  assert.deepEqual(await useCase.execute({
    mode: "test",
    event: {
      type: "invoice.paid",
      data: {
        object: {
          id: "in_manual",
          object: "invoice",
          customer: "cus_123",
          parent: null,
        },
      },
    },
  }), {
    handled: false,
    eventType: "invoice.paid",
    mode: "test",
    invoiceReference: "in_manual",
  });
  assert.equal(stripeCalls, 0);
});
