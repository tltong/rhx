const assert = require("node:assert/strict");
const test = require("node:test");

const {
  StripePayment,
} = require("./domain/stripe_payment");

function stripeClient(overrides = {}) {
  return {
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
    ...overrides,
  };
}

test("StripePayment creates a subscription with an internal Price", async () => {
  const priceCalls = [];
  const subscriptionCalls = [];
  const payment = new StripePayment(stripeClient({
    prices: {
      async list(input) {
        priceCalls.push({operation: "list", input});
        return {data: []};
      },
      async create(input, options) {
        priceCalls.push({operation: "create", input, options});
        return {id: "price_subscription_123"};
      },
    },
    subscriptions: {
      async create(input, options) {
        subscriptionCalls.push({input, options});
        return {
          id: "sub_123",
          status: "incomplete",
          latest_invoice: {
            confirmation_secret: {
              client_secret: "pi_subscription_secret_123",
            },
          },
        };
      },
    },
  }));

  const result = await payment.createSubscription({
    customerReference: "cus_123",
    paymentMethodReference: "pm_123",
    stripeProductName: "RHX Quarterly Learning",
    amount: 4500,
    currency: "MYR",
    interval: "MONTH",
    intervalCount: 3,
    idempotencyReference: "checkout-attempt-123",
  });

  assert.deepEqual(result, {
    subscriptionReference: "sub_123",
    status: "incomplete",
    paymentClientSecret: "pi_subscription_secret_123",
  });
  assert.deepEqual(priceCalls[0], {
    operation: "list",
    input: {
      active: true,
      lookup_keys: [
        "rhx-subscription-myr-4500-month-3-a3f36e1464b2e0a4",
      ],
      limit: 1,
    },
  });
  assert.deepEqual(priceCalls[1], {
    operation: "create",
    input: {
      currency: "myr",
      unit_amount: 4500,
      recurring: {
        interval: "month",
        interval_count: 3,
      },
      product_data: {
        name: "RHX Quarterly Learning",
      },
      lookup_key:
        "rhx-subscription-myr-4500-month-3-a3f36e1464b2e0a4",
    },
    options: {
      idempotencyKey:
        "create-rhx-subscription-myr-4500-month-3-a3f36e1464b2e0a4",
    },
  });
  assert.deepEqual(subscriptionCalls[0].input, {
    customer: "cus_123",
    default_payment_method: "pm_123",
    items: [{price: "price_subscription_123"}],
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    expand: ["latest_invoice.confirmation_secret"],
  });
  assert.match(
    subscriptionCalls[0].options.idempotencyKey,
    /^create-payment-subscription-[a-f0-9]{64}$/,
  );
});

test("StripePayment reuses an existing internal Price", async () => {
  let createPriceCalls = 0;
  const payment = new StripePayment(stripeClient({
    prices: {
      async list() {
        return {data: [{id: "price_existing"}]};
      },
      async create() {
        createPriceCalls += 1;
        return {id: "price_unused"};
      },
    },
    subscriptions: {
      async create(input) {
        assert.deepEqual(input.items, [{price: "price_existing"}]);
        return {
          id: "sub_active",
          status: "active",
          latest_invoice: {
            confirmation_secret: {
              client_secret: "pi_already_paid_secret",
            },
          },
        };
      },
    },
  }));

  const result = await payment.createSubscription({
    customerReference: "cus_123",
    paymentMethodReference: "pm_123",
    stripeProductName: "RHX Monthly Learning",
    amount: 1200,
    currency: "usd",
    interval: "month",
    intervalCount: 1,
    idempotencyReference: "checkout-attempt-456",
  });

  assert.equal(createPriceCalls, 0);
  assert.deepEqual(result, {
    subscriptionReference: "sub_active",
    status: "active",
    paymentClientSecret: null,
  });
});

test("StripePayment validates subscription billing terms", async () => {
  const payment = new StripePayment(stripeClient());
  const validInput = {
    customerReference: "cus_123",
    paymentMethodReference: "pm_123",
    stripeProductName: "RHX Monthly Learning",
    amount: 1200,
    currency: "myr",
    interval: "month",
    intervalCount: 1,
    idempotencyReference: "checkout-attempt-789",
  };

  await assert.rejects(
    () => payment.createSubscription({...validInput, amount: 12.5}),
    /amount must be a non-negative integer/,
  );
  await assert.rejects(
    () => payment.createSubscription({...validInput, currency: "ringgit"}),
    /currency must be a three-letter currency code/,
  );
  await assert.rejects(
    () => payment.createSubscription({...validInput, interval: "quarter"}),
    /interval must be day, week, month, or year/,
  );
  await assert.rejects(
    () => payment.createSubscription({...validInput, intervalCount: 37}),
    /intervalCount must not exceed three years/,
  );
  await assert.rejects(
    () => payment.createSubscription({
      ...validInput,
      stripeProductName: " ",
    }),
    /stripeProductName is required/,
  );
  await assert.rejects(
    () => payment.createSubscription({
      ...validInput,
      idempotencyReference: "",
    }),
    /idempotencyReference is required/,
  );
});

test("StripePayment reuses a subscription idempotency key on retries", async () => {
  const idempotencyKeys = [];
  const payment = new StripePayment(stripeClient({
    prices: {
      async list() {
        return {data: [{id: "price_existing"}]};
      },
      async create() {
        throw new Error("Price should not be created.");
      },
    },
    subscriptions: {
      async create(input, options) {
        idempotencyKeys.push(options.idempotencyKey);
        return {id: "sub_123", status: "active"};
      },
    },
  }));
  const input = {
    customerReference: "cus_123",
    paymentMethodReference: "pm_123",
    stripeProductName: "RHX Monthly Learning",
    amount: 1200,
    currency: "myr",
    interval: "month",
    intervalCount: 1,
    idempotencyReference: "same-checkout-attempt",
  };

  await payment.createSubscription(input);
  await payment.createSubscription(input);

  assert.equal(idempotencyKeys.length, 2);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
});

test("StripePayment retrieves a normalized Subscription", async () => {
  const retrieveCalls = [];
  const payment = new StripePayment(stripeClient({
    subscriptions: {
      async retrieve(reference) {
        retrieveCalls.push(reference);
        return {
          id: "sub_123",
          customer: {id: "cus_123"},
          status: "active",
          start_date: 1764547200,
          current_period_start: 1,
          current_period_end: 2,
          items: {
            data: [{
              current_period_start: 1767225600,
              current_period_end: 1769904000,
            }],
          },
          cancel_at_period_end: true,
        };
      },
    },
  }));

  const result = await payment.retrieveSubscription("sub_123");

  assert.deepEqual(retrieveCalls, ["sub_123"]);
  assert.deepEqual(result, {
    subscriptionReference: "sub_123",
    customerReference: "cus_123",
    status: "active",
    subscriptionStartDate: new Date(1764547200 * 1000),
    currentPeriodStart: new Date(1767225600 * 1000),
    currentPeriodEnd: new Date(1769904000 * 1000),
    cancelAtPeriodEnd: true,
  });
  assert.equal(Object.isFrozen(result), true);
});

test("StripePayment supports legacy Subscription period fields", async () => {
  const payment = new StripePayment(stripeClient({
    subscriptions: {
      async retrieve() {
        return {
          id: "sub_legacy",
          customer: "cus_legacy",
          status: "past_due",
          start_date: 1764547200,
          current_period_start: 1767225600,
          current_period_end: 1769904000,
          items: {data: [{id: "si_legacy"}]},
          cancel_at_period_end: false,
        };
      },
    },
  }));

  const result = await payment.retrieveSubscription("sub_legacy");

  assert.equal(result.customerReference, "cus_legacy");
  assert.equal(result.subscriptionStartDate.getTime(), 1764547200 * 1000);
  assert.equal(result.currentPeriodStart.getTime(), 1767225600 * 1000);
  assert.equal(result.currentPeriodEnd.getTime(), 1769904000 * 1000);
  assert.equal(result.cancelAtPeriodEnd, false);
});

test("StripePayment validates Subscription retrieval results", async () => {
  const payment = new StripePayment(stripeClient({
    subscriptions: {
      async retrieve() {
        return {
          id: "sub_unexpected",
          customer: "cus_123",
          status: "active",
          start_date: 1764547200,
          items: {
            data: [{
              current_period_start: 1767225600,
              current_period_end: 1769904000,
            }],
          },
          cancel_at_period_end: false,
        };
      },
    },
  }));

  await assert.rejects(
    () => payment.retrieveSubscription(" "),
    /subscriptionReference is required/,
  );
  await assert.rejects(
    () => payment.retrieveSubscription("sub_expected"),
    /unexpected Subscription reference/,
  );
});

test("StripePayment rejects ambiguous Subscription billing periods", async () => {
  const payment = new StripePayment(stripeClient({
    subscriptions: {
      async retrieve() {
        return {
          id: "sub_multiple",
          customer: "cus_123",
          status: "active",
          start_date: 1764547200,
          items: {
            data: [
              {current_period_start: 1, current_period_end: 2},
              {current_period_start: 1, current_period_end: 3},
            ],
          },
          cancel_at_period_end: false,
        };
      },
    },
  }));

  await assert.rejects(
    () => payment.retrieveSubscription("sub_multiple"),
    /multiple billing periods/,
  );
});
