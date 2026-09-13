const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CreateStripePaymentCustomer,
} = require("./application/create_stripe_payment_customer");
const {
  DeleteStripePaymentCustomer,
} = require("./application/delete_stripe_payment_customer");
const {
  CreateStripePaymentSetupIntent,
} = require("./application/create_stripe_payment_setup_intent");
const {
  ProcessStripeSetupIntentEvent,
} = require("./application/process_stripe_setup_intent_event");
const stripePaymentCustomerModule = require(
  "./stripe_payment_customer_module",
);

function stripeContext(createCustomer, overrides = {}) {
  return {
    providerName: "stripe",
    mode: "test",
    paymentProvider: {
      createCustomer,
      async customerExists() {
        return true;
      },
      ...overrides,
    },
  };
}

test("stripe payment customer module exposes its application API", () => {
  assert.deepEqual(Object.keys(stripePaymentCustomerModule), [
    "createStripePaymentCustomer",
    "createStripePaymentSetupIntent",
    "deleteStripePaymentCustomer",
    "processStripeSetupIntentEvent",
  ]);
});

test("successful SetupIntent event updates setup and payment method records", async () => {
  const calls = [];
  const useCase = new ProcessStripeSetupIntentEvent({
    createStripePayment: ({mode}) => {
      calls.push(["provider", mode]);
      return {
        async retrievePaymentMethod(paymentMethodReference) {
          calls.push(["retrieve", paymentMethodReference]);
          return {
            paymentMethodReference,
            customerReference: "cus_event",
            type: "card",
            card: {
              brand: "visa",
              last4: "4242",
              expiryMonth: 12,
              expiryYear: 2030,
            },
          };
        },
      };
    },
    getCustomerRecordByReference: async (input) => {
      calls.push(["customer", input]);
      return {customerReference: input.customerReference};
    },
    writeSetupIntentRecord: async (input) => {
      calls.push(["setup", input]);
    },
    writePaymentMethodRecord: async (input) => {
      calls.push(["payment-method", input]);
    },
  });
  const event = {
    type: "setup_intent.succeeded",
    data: {
      object: {
        object: "setup_intent",
        id: "seti_event",
        customer: "cus_event",
        status: "succeeded",
        usage: "off_session",
        payment_method: "pm_event",
      },
    },
  };

  const result = await useCase.execute({mode: "test", event});

  assert.deepEqual(result, {
    handled: true,
    eventType: "setup_intent.succeeded",
    mode: "test",
    customerReference: "cus_event",
    setupIntentReference: "seti_event",
    status: "succeeded",
    paymentMethodReference: "pm_event",
  });
  assert.deepEqual(calls, [
    ["customer", {
      mode: "test",
      customerReference: "cus_event",
    }],
    ["provider", "test"],
    ["retrieve", "pm_event"],
    ["setup", {
      mode: "test",
      customerReference: "cus_event",
      setupIntentReference: "seti_event",
      status: "succeeded",
      usage: "off_session",
      paymentMethodReference: "pm_event",
    }],
    ["payment-method", {
      mode: "test",
      customerReference: "cus_event",
      paymentMethodReference: "pm_event",
      setupIntentReference: "seti_event",
      type: "card",
      status: "active",
      card: {
        brand: "visa",
        last4: "4242",
        expiryMonth: 12,
        expiryYear: 2030,
      },
    }],
  ]);
});

for (const eventCase of [
  {
    type: "setup_intent.setup_failed",
    status: "requires_payment_method",
  },
  {
    type: "setup_intent.canceled",
    status: "canceled",
  },
]) {
  test(`${eventCase.type} updates only the setup record`, async () => {
    const calls = [];
    const useCase = new ProcessStripeSetupIntentEvent({
      createStripePayment: () => {
        throw new Error("Stripe retrieval should not run.");
      },
      getCustomerRecordByReference: async () => ({
        customerReference: "cus_unsuccessful",
      }),
      writeSetupIntentRecord: async (input) => {
        calls.push(input);
      },
      writePaymentMethodRecord: async () => {
        throw new Error("PaymentMethod persistence should not run.");
      },
    });

    const result = await useCase.execute({
      mode: "prod",
      event: {
        type: eventCase.type,
        data: {
          object: {
            object: "setup_intent",
            id: "seti_unsuccessful",
            customer: "cus_unsuccessful",
            status: eventCase.status,
            usage: "off_session",
            payment_method: null,
          },
        },
      },
    });

    assert.equal(result.handled, true);
    assert.deepEqual(calls, [{
      mode: "prod",
      customerReference: "cus_unsuccessful",
      setupIntentReference: "seti_unsuccessful",
      status: eventCase.status,
      usage: "off_session",
      paymentMethodReference: null,
    }]);
  });
}

test("unsupported Stripe events are ignored without persistence", async () => {
  const useCase = new ProcessStripeSetupIntentEvent({
    createStripePayment: () => {
      throw new Error("Provider should not be created.");
    },
    getCustomerRecordByReference: async () => {
      throw new Error("Customer should not be loaded.");
    },
    writeSetupIntentRecord: async () => {
      throw new Error("SetupIntent should not be written.");
    },
    writePaymentMethodRecord: async () => {
      throw new Error("PaymentMethod should not be written.");
    },
  });

  assert.deepEqual(await useCase.execute({
    mode: "test",
    event: {type: "customer.created"},
  }), {
    handled: false,
    eventType: "customer.created",
  });
});

test("create Stripe SetupIntent persists its initial state", async () => {
  const calls = [];
  const useCase = new CreateStripePaymentSetupIntent({
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "test",
      paymentProvider: {
        async createSetupIntent(customerReference) {
          calls.push(["stripe", customerReference]);
          return {
            setupIntentReference: "seti_created",
            clientSecret: "seti_created_secret_value",
            status: "requires_payment_method",
            usage: "off_session",
            paymentMethodReference: null,
          };
        },
      },
    }),
    getCustomerRecordByReference: async (input) => {
      calls.push(["lookup", input]);
      return {customerReference: input.customerReference};
    },
    writeSetupIntentRecord: async (input) => {
      calls.push(["save", input]);
    },
  });

  const result = await useCase.execute({
    customerReference: "cus_setup",
  });

  assert.equal(result, "seti_created_secret_value");
  assert.deepEqual(calls, [
    ["lookup", {
      mode: "test",
      customerReference: "cus_setup",
    }],
    ["stripe", "cus_setup"],
    ["save", {
      mode: "test",
      customerReference: "cus_setup",
      setupIntentReference: "seti_created",
      status: "requires_payment_method",
      usage: "off_session",
      paymentMethodReference: null,
    }],
  ]);
});

test("create Stripe SetupIntent rejects an unregistered customer", async () => {
  let stripeCalls = 0;
  const useCase = new CreateStripePaymentSetupIntent({
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "prod",
      paymentProvider: {
        async createSetupIntent() {
          stripeCalls += 1;
          return {};
        },
      },
    }),
    getCustomerRecordByReference: async () => null,
    writeSetupIntentRecord: async () => {},
  });

  await assert.rejects(
    () => useCase.execute({customerReference: "cus_missing"}),
    /not registered in prod mode/,
  );
  assert.equal(stripeCalls, 0);
});

test("create Stripe customer persists the returned reference", async () => {
  const calls = [];
  const useCase = new CreateStripePaymentCustomer({
    createPaymentProviderContext: async () => stripeContext(
      async (internalReference, email) => {
        calls.push(["stripe", internalReference, email]);
        return "cus_created";
      },
    ),
    getCustomerRecordByInternalReference: async (input) => {
      calls.push(["lookup", input]);
      return null;
    },
    createCustomerRecord: async (input) => {
      calls.push(["save", input]);
    },
  });

  const result = await useCase.execute({
    internalReference: "internal-123",
    email: "customer@example.com",
  });

  assert.equal(result, "cus_created");
  assert.deepEqual(calls, [
    ["lookup", {
      mode: "test",
      internalReference: "internal-123",
    }],
    ["stripe", "internal-123", "customer@example.com"],
    ["save", {
      mode: "test",
      customerReference: "cus_created",
      internalReference: "internal-123",
      email: "customer@example.com",
    }],
  ]);
});

test("create Stripe customer reuses an existing customer record", async () => {
  let stripeCalls = 0;
  const checkedReferences = [];
  let writes = 0;
  const useCase = new CreateStripePaymentCustomer({
    createPaymentProviderContext: async () => stripeContext(
      async () => {
        stripeCalls += 1;
        return "cus_unused";
      },
      {
        async customerExists(customerReference) {
          checkedReferences.push(customerReference);
          return true;
        },
      },
    ),
    getCustomerRecordByInternalReference: async () => ({
      customerReference: "cus_existing",
    }),
    createCustomerRecord: async () => {
      writes += 1;
    },
  });

  const result = await useCase.execute({
    internalReference: "internal-existing",
    email: "existing@example.com",
  });

  assert.equal(result, "cus_existing");
  assert.deepEqual(checkedReferences, ["cus_existing"]);
  assert.equal(stripeCalls, 0);
  assert.equal(writes, 0);
});

test("create Stripe customer repairs a stale customer record", async () => {
  const calls = [];
  const useCase = new CreateStripePaymentCustomer({
    createPaymentProviderContext: async () => stripeContext(
      async (internalReference, email) => {
        calls.push(["stripe", internalReference, email]);
        return "cus_replacement";
      },
      {
        async customerExists(customerReference) {
          calls.push(["exists", customerReference]);
          return false;
        },
      },
    ),
    getCustomerRecordByInternalReference: async (input) => {
      calls.push(["lookup", input]);
      return {customerReference: "cus_stale"};
    },
    createCustomerRecord: async () => {
      throw new Error("A new record should not be created.");
    },
    replaceCustomerRecord: async (input) => {
      calls.push(["replace", input]);
    },
  });

  const result = await useCase.execute({
    internalReference: "internal-stale",
    email: "replacement@example.com",
  });

  assert.equal(result, "cus_replacement");
  assert.deepEqual(calls, [
    ["lookup", {
      mode: "test",
      internalReference: "internal-stale",
    }],
    ["exists", "cus_stale"],
    ["stripe", "internal-stale", "replacement@example.com"],
    ["replace", {
      mode: "test",
      customerReference: "cus_replacement",
      internalReference: "internal-stale",
      email: "replacement@example.com",
      staleCustomerReference: "cus_stale",
    }],
  ]);
});

test("create Stripe customer resolves a concurrent persistence write", async () => {
  let lookupCount = 0;
  const duplicateError = new Error("Internal reference already exists.");
  duplicateError.code = "already-exists";
  const useCase = new CreateStripePaymentCustomer({
    createPaymentProviderContext: async () => stripeContext(
      async () => "cus_concurrent",
    ),
    getCustomerRecordByInternalReference: async () => {
      lookupCount += 1;

      return lookupCount === 1
        ? null
        : {customerReference: "cus_concurrent"};
    },
    createCustomerRecord: async () => {
      throw duplicateError;
    },
  });

  const result = await useCase.execute({
    internalReference: "internal-concurrent",
    email: "concurrent@example.com",
  });

  assert.equal(result, "cus_concurrent");
  assert.equal(lookupCount, 2);
});

test("create Stripe customer rejects a non-Stripe provider", async () => {
  const useCase = new CreateStripePaymentCustomer({
    createPaymentProviderContext: async () => ({
      providerName: "other-provider",
      mode: "test",
      paymentProvider: {createCustomer: async () => "customer-1"},
    }),
    getCustomerRecordByInternalReference: async () => null,
    createCustomerRecord: async () => {},
  });

  await assert.rejects(
    () => useCase.execute({
      internalReference: "internal-123",
      email: "customer@example.com",
    }),
    /configured payment provider is not Stripe/,
  );
});

test("delete Stripe customer removes Stripe before its local record", async () => {
  const calls = [];
  const useCase = new DeleteStripePaymentCustomer({
    createPaymentProviderContext: async () => ({
      providerName: "stripe",
      mode: "prod",
      paymentProvider: {
        async deleteCustomer(customerReference) {
          calls.push(["stripe", customerReference]);
          return customerReference;
        },
      },
    }),
    deleteCustomerRecord: async (input) => {
      calls.push(["database", input]);
    },
  });

  const result = await useCase.execute({
    customerReference: "cus_delete",
  });

  assert.equal(result, "cus_delete");
  assert.deepEqual(calls, [
    ["stripe", "cus_delete"],
    ["database", {
      mode: "prod",
      customerReference: "cus_delete",
    }],
  ]);
});

test("delete Stripe customer keeps its local record when Stripe fails", async () => {
  let databaseDeletes = 0;
  const useCase = new DeleteStripePaymentCustomer({
    createPaymentProviderContext: async () => stripeContext(async () => {}),
    deleteCustomerRecord: async () => {
      databaseDeletes += 1;
    },
  });
  useCase.createPaymentProviderContext = async () => ({
    providerName: "stripe",
    mode: "test",
    paymentProvider: {
      async deleteCustomer() {
        throw new Error("Stripe deletion failed.");
      },
    },
  });

  await assert.rejects(
    () => useCase.execute({customerReference: "cus_keep"}),
    /Stripe deletion failed/,
  );
  assert.equal(databaseDeletes, 0);
});

test("delete Stripe customer rejects a non-Stripe provider", async () => {
  const useCase = new DeleteStripePaymentCustomer({
    createPaymentProviderContext: async () => ({
      providerName: "other-provider",
      mode: "test",
      paymentProvider: {deleteCustomer: async () => "customer-1"},
    }),
    deleteCustomerRecord: async () => {},
  });

  await assert.rejects(
    () => useCase.execute({customerReference: "cus_delete"}),
    /configured payment provider is not Stripe/,
  );
});
