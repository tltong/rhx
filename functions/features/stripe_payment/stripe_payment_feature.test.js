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

test("StripePayment creates a customer with the supplied reference", async () => {
  const calls = [];
  const payment = new StripePayment({
    customers: {
      async create(input) {
        calls.push(input);
        return {id: "cus_test_123"};
      },
      async del() {
        return {id: "cus_unused", deleted: true};
      },
    },
  });

  const result = await payment.createCustomer("client-123");

  assert.equal(result, "cus_test_123");
  assert.deepEqual(calls, [{
    metadata: {
      clientReference: "client-123",
    },
  }]);
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
    () => payment.createCustomer(" "),
    /inputReference is required/,
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
          client_secret: "seti_secret_123",
        };
      },
    },
  });

  const result = await payment.createSetupIntent("cus_setup_123");

  assert.equal(result, "seti_secret_123");
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
        return {client_secret: null};
      },
    },
  });

  await assert.rejects(
    () => payment.createSetupIntent("cus_setup_123"),
    /did not return a SetupIntent client secret/,
  );
});

test("Stripe secret provider selects test and production secrets", () => {
  const provider = new StripeSecretKeyProvider({
    testSecretKey: {value: () => "sk_test_value"},
    prodSecretKey: {value: () => "sk_live_value"},
  });

  assert.equal(provider.getSecretKey("test"), "sk_test_value");
  assert.equal(provider.getSecretKey("prod"), "sk_live_value");
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
