const assert = require("node:assert/strict");
const test = require("node:test");

const {
  StripePayment,
} = require("./domain/stripe_payment");
const {
  StripePaymentFactory,
} = require("./infrastructure/stripe_payment_factory");
const {
  StripeSecretKeyProvider,
} = require("./infrastructure/stripe_secret_key_provider");
const {
  StripePublishableKeyProvider,
} = require("./infrastructure/stripe_publishable_key_provider");
const {
  stripeProdWebhookSecret,
  stripeProdWebhookSecrets,
  stripeTestWebhookSecret,
  stripeTestWebhookSecrets,
} = require("./stripe_payment_module");

test("Stripe test webhook secrets use the expected Firebase secret names", () => {
  assert.equal(
    stripeTestWebhookSecret.name,
    "STRIPE_TEST_WEBHOOK_SECRET",
  );
  assert.deepEqual(
    stripeTestWebhookSecrets.map(({name}) => name),
    ["STRIPE_TEST_SECRET_KEY", "STRIPE_TEST_WEBHOOK_SECRET"],
  );
});

test("Stripe production webhook secrets use the expected Firebase secret names", () => {
  assert.equal(
    stripeProdWebhookSecret.name,
    "STRIPE_PROD_WEBHOOK_SECRET",
  );
  assert.deepEqual(
    stripeProdWebhookSecrets.map(({name}) => name),
    ["STRIPE_PROD_SECRET_KEY", "STRIPE_PROD_WEBHOOK_SECRET"],
  );
});

test("StripePayment creates a customer with the supplied reference", async () => {
  const calls = [];
  const payment = new StripePayment({
    customers: {
      async create(input, options) {
        calls.push({input, options});
        return {id: "cus_test_123"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
  });

  const result = await payment.createCustomer("client-123", "test@example.com");

  assert.equal(result, "cus_test_123");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].input, {
    email: "test@example.com",
    metadata: {
      clientReference: "client-123",
    },
  });
  assert.match(
    calls[0].options.idempotencyKey,
    /^create-payment-customer-[a-f0-9-]{36}$/,
  );
});

test("StripePayment uses a new idempotency key for each creation", async () => {
  const idempotencyKeys = [];
  const payment = new StripePayment({
    customers: {
      async create(_input, options) {
        idempotencyKeys.push(options.idempotencyKey);
        return {id: `cus_test_${idempotencyKeys.length}`};
      },
      async del() {
        return {id: "cus_deleted", deleted: true};
      },
    },
    setupIntents: {
      async create() {
        return {client_secret: "seti_secret"};
      },
    },
  });

  await payment.createCustomer("student1", "student@example.com");
  await payment.createCustomer("student1", "student@example.com");

  assert.equal(idempotencyKeys.length, 2);
  assert.notEqual(idempotencyKeys[0], idempotencyKeys[1]);
});

test("StripePayment checks whether a customer exists", async () => {
  const retrievedReferences = [];
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async retrieve(customerReference) {
        retrievedReferences.push(customerReference);

        if (customerReference === "cus_missing") {
          const error = new Error("No such customer.");
          error.code = "resource_missing";
          error.statusCode = 404;
          throw error;
        }

        return {
          id: customerReference,
          deleted: customerReference === "cus_deleted",
        };
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
  });

  assert.equal(await payment.customerExists("cus_active"), true);
  assert.equal(await payment.customerExists("cus_deleted"), false);
  assert.equal(await payment.customerExists("cus_missing"), false);
  assert.deepEqual(retrievedReferences, [
    "cus_active",
    "cus_deleted",
    "cus_missing",
  ]);
});

test("StripePayment rejects a missing input reference", async () => {
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
  });

  await assert.rejects(
    () => payment.createCustomer(" ", "test@example.com"),
    /inputReference is required/,
  );
});

test("StripePayment rejects an invalid customer email", async () => {
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
  });

  await assert.rejects(
    () => payment.createCustomer("student1", "not-an-email"),
    /email must be a valid email address/,
  );
});

test("StripePayment deletes and returns the Stripe customer reference", async () => {
  const calls = [];
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del(customerReference) {
        calls.push(customerReference);
        return {
          id: customerReference,
          deleted: true,
        };
      },
    },
  });

  const result = await payment.deleteCustomer("cus_delete_123");

  assert.equal(result, "cus_delete_123");
  assert.deepEqual(calls, ["cus_delete_123"]);
});

test("StripePayment rejects a missing customer reference", async () => {
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
  });

  await assert.rejects(
    () => payment.deleteCustomer(" "),
    /customerReference is required/,
  );
});

test("StripePayment creates a recurring-payment SetupIntent", async () => {
  const calls = [];
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
    setupIntents: {
      async create(input) {
        calls.push(input);
        return {
          id: "seti_123",
          client_secret: "seti_secret_123",
          status: "requires_payment_method",
          usage: "off_session",
          payment_method: null,
        };
      },
    },
  });

  const result = await payment.createSetupIntent("cus_setup_123");

  assert.deepEqual(result, {
    setupIntentReference: "seti_123",
    clientSecret: "seti_secret_123",
    status: "requires_payment_method",
    usage: "off_session",
    paymentMethodReference: null,
  });
  assert.deepEqual(calls, [{
    customer: "cus_setup_123",
    usage: "off_session",
    automatic_payment_methods: {
      enabled: true,
    },
  }]);
});

test("StripePayment rejects a missing SetupIntent client secret", async () => {
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
    setupIntents: {
      async create() {
        return {
          id: "seti_123",
          client_secret: null,
          status: "requires_payment_method",
          usage: "off_session",
        };
      },
    },
  });

  await assert.rejects(
    () => payment.createSetupIntent("cus_setup_123"),
    /did not return a SetupIntent client secret/,
  );
});

test("StripePayment constructs a verified webhook event", () => {
  const calls = [];
  const expectedEvent = {
    id: "evt_verified",
    type: "setup_intent.succeeded",
  };
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
    webhooks: {
      constructEvent(payload, signature, webhookSecret) {
        calls.push({payload, signature, webhookSecret});
        return expectedEvent;
      },
    },
  });
  const payload = Buffer.from("{\"id\":\"evt_verified\"}");

  const event = payment.constructWebhookEvent({
    payload,
    signature: "stripe-signature",
    webhookSecret: "whsec_test",
  });

  assert.equal(event, expectedEvent);
  assert.deepEqual(calls, [{
    payload,
    signature: "stripe-signature",
    webhookSecret: "whsec_test",
  }]);
});

test("StripePayment retrieves normalized PaymentMethod details", async () => {
  const calls = [];
  const payment = new StripePayment({
    customers: {
      async create() {
        return {id: "cus_unused"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
    paymentMethods: {
      async retrieve(paymentMethodReference) {
        calls.push(paymentMethodReference);
        return {
          id: paymentMethodReference,
          customer: {id: "cus_payment_method"},
          type: "card",
          card: {
            brand: "visa",
            last4: "4242",
            exp_month: 12,
            exp_year: 2030,
          },
        };
      },
    },
  });

  const result = await payment.retrievePaymentMethod("pm_123");

  assert.deepEqual(result, {
    paymentMethodReference: "pm_123",
    customerReference: "cus_payment_method",
    type: "card",
    card: {
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2030,
    },
  });
  assert.deepEqual(calls, ["pm_123"]);
});

test("Stripe secret provider selects test and production secrets", () => {
  const provider = new StripeSecretKeyProvider({
    testSecretKey: {value: () => "sk_test_value"},
    prodSecretKey: {value: () => "sk_live_value"},
  });

  assert.equal(provider.getSecretKey("test"), "sk_test_value");
  assert.equal(provider.getSecretKey("prod"), "sk_live_value");
});

test("Stripe publishable-key provider selects matching modes", () => {
  const provider = new StripePublishableKeyProvider({
    testPublishableKey: {value: () => "pk_test_value"},
    prodPublishableKey: {value: () => "pk_live_value"},
  });

  assert.equal(provider.getPublishableKey("test"), "pk_test_value");
  assert.equal(provider.getPublishableKey("prod"), "pk_live_value");
});

test("Stripe publishable-key provider rejects a mismatched key", () => {
  const provider = new StripePublishableKeyProvider({
    testPublishableKey: {value: () => "pk_live_wrong_mode"},
    prodPublishableKey: {value: () => "pk_live_value"},
  });

  assert.throws(
    () => provider.getPublishableKey("test"),
    /not a valid Stripe publishable key/,
  );
});

test("Stripe factory initializes the SDK using the selected secret", () => {
  const receivedKeys = [];

  class FakeStripe {
    constructor(secretKey) {
      receivedKeys.push(secretKey);
      this.customers = {
        async create() {
          return {id: "cus_factory"};
        },
        async del(customerReference) {
          return {id: customerReference, deleted: true};
        },
      };
    }
  }

  const factory = new StripePaymentFactory({
    StripeConstructor: FakeStripe,
    secretKeyProvider: {
      getSecretKey(mode) {
        assert.equal(mode, "prod");
        return "sk_live_factory";
      },
    },
  });

  const payment = factory.create({mode: "prod"});

  assert.ok(payment instanceof StripePayment);
  assert.deepEqual(receivedKeys, ["sk_live_factory"]);
});
