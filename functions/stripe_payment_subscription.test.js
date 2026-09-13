const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStripeSubscriptionHandlers,
} = require("./stripe_payment_subscription");

function authenticatedRequest(overrides = {}) {
  return {
    auth: {uid: "caller-123"},
    data: {
      customerReference: "cus_123",
      paymentMethodReference: "pm_123",
      country: "Malaysia",
      planId: "plan-quarterly",
      idempotencyReference: "checkout-attempt-123",
      ...overrides,
    },
  };
}

test("subscription callable uses the plan-based external contract", async () => {
  const calls = [];
  const handlers = createStripeSubscriptionHandlers({
    async createPaymentSubscription(input) {
      calls.push(input);
      return {
        subscriptionReference: "sub_123",
        status: "incomplete",
        paymentClientSecret: "pi_subscription_secret_123",
      };
    },
  });

  const result = await handlers.createStripeSubscriptionHandler(
    authenticatedRequest(),
  );

  assert.deepEqual(calls, [{
    customerReference: "cus_123",
    paymentMethodReference: "pm_123",
    country: "Malaysia",
    planId: "plan-quarterly",
    idempotencyReference: "checkout-attempt-123",
  }]);
  assert.deepEqual(result, {
    subscriptionReference: "sub_123",
    status: "incomplete",
    paymentClientSecret: "pi_subscription_secret_123",
  });
});

test("subscription callable requires authentication", async () => {
  const handlers = createStripeSubscriptionHandlers();

  await assert.rejects(
    () => handlers.createStripeSubscriptionHandler({
      data: authenticatedRequest().data,
    }),
    (error) => error.code === "unauthenticated",
  );
});

test("subscription callable validates plan and idempotency references", async () => {
  const handlers = createStripeSubscriptionHandlers();

  await assert.rejects(
    () => handlers.createStripeSubscriptionHandler(
      authenticatedRequest({country: "Malaysia/plans"}),
    ),
    (error) => error.code === "invalid-argument"
      && /country/.test(error.message),
  );
  await assert.rejects(
    () => handlers.createStripeSubscriptionHandler(
      authenticatedRequest({planId: "plans/quarterly"}),
    ),
    (error) => error.code === "invalid-argument"
      && /planId/.test(error.message),
  );
  await assert.rejects(
    () => handlers.createStripeSubscriptionHandler(
      authenticatedRequest({idempotencyReference: ""}),
    ),
    (error) => error.code === "invalid-argument"
      && /idempotencyReference/.test(error.message),
  );
});

test("subscription callable reports an unconfigured plan as not-found", async () => {
  const handlers = createStripeSubscriptionHandlers({
    async createPaymentSubscription() {
      const error = new Error("The subscription plan is not configured.");
      error.code = "not-found";
      throw error;
    },
  });

  await assert.rejects(
    () => handlers.createStripeSubscriptionHandler(authenticatedRequest()),
    (error) => error.code === "not-found"
      && /not configured/.test(error.message),
  );
});

test("subscription callable uses null when no payment secret is needed", async () => {
  const handlers = createStripeSubscriptionHandlers({
    async createPaymentSubscription() {
      return {
        subscriptionReference: "sub_active",
        status: "active",
      };
    },
  });

  const result = await handlers.createStripeSubscriptionHandler(
    authenticatedRequest(),
  );

  assert.deepEqual(result, {
    subscriptionReference: "sub_active",
    status: "active",
    paymentClientSecret: null,
  });
});

test("payment-action callable derives ownership from the authenticated user", async () => {
  const calls = [];
  const handlers = createStripeSubscriptionHandlers({
    async getSubscriptionPaymentAction(input) {
      calls.push(input);
      return {
        action: "confirm_payment",
        subscriptionReference: "sub_123",
        invoiceReference: "in_123",
        paymentStatus: "requires_action",
        paymentClientSecret: "pi_123_secret_action",
        amountDue: 4500,
        currency: "MYR",
      };
    },
  });

  const result =
    await handlers.getStripeSubscriptionPaymentActionHandler({
      auth: {uid: "firebase-user-123"},
      data: {
        subscriptionReference: "sub_123",
        customerReference: "cus_untrusted_browser_value",
      },
    });

  assert.deepEqual(calls, [{
    internalReference: "firebase-user-123",
    subscriptionReference: "sub_123",
  }]);
  assert.deepEqual(result, {
    action: "confirm_payment",
    subscriptionReference: "sub_123",
    invoiceReference: "in_123",
    paymentStatus: "requires_action",
    paymentClientSecret: "pi_123_secret_action",
    amountDue: 4500,
    currency: "myr",
  });
});

test("payment-action callable never returns a secret for a wait action", async () => {
  const handlers = createStripeSubscriptionHandlers({
    async getSubscriptionPaymentAction() {
      return {
        action: "wait",
        subscriptionReference: "sub_123",
        invoiceReference: "in_123",
        paymentStatus: "processing",
        paymentClientSecret: "pi_secret_should_be_redacted",
        amountDue: 4500,
        currency: "myr",
      };
    },
  });

  const result =
    await handlers.getStripeSubscriptionPaymentActionHandler({
      auth: {uid: "firebase-user-123"},
      data: {subscriptionReference: "sub_123"},
    });

  assert.equal(result.paymentClientSecret, null);
  assert.equal(result.action, "wait");
});

test("payment-action callable requires auth and maps safe domain errors", async () => {
  const handlers = createStripeSubscriptionHandlers({
    async getSubscriptionPaymentAction() {
      const error = new Error("Stripe subscription could not be found.");
      error.code = "not-found";
      throw error;
    },
  });

  await assert.rejects(
    () => handlers.getStripeSubscriptionPaymentActionHandler({
      data: {subscriptionReference: "sub_123"},
    }),
    (error) => error.code === "unauthenticated",
  );
  await assert.rejects(
    () => handlers.getStripeSubscriptionPaymentActionHandler({
      auth: {uid: "firebase-user-123"},
      data: {subscriptionReference: "sub_123"},
    }),
    (error) => error.code === "not-found",
  );
});

test("Functions index exports both Stripe subscription callables", () => {
  const functionsIndex = require("./index");

  assert.equal(typeof functionsIndex.createStripeSubscription, "function");
  assert.equal(
    typeof functionsIndex.getStripeSubscriptionPaymentAction,
    "function",
  );
});
