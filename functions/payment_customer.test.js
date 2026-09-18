const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPaymentCustomerHandlers,
} = require("./payment_customer");

function authenticatedRequest(inputReference, email = "client@example.com") {
  return {
    auth: {
      uid: "caller-1",
    },
    data: {
      inputReference,
      email,
    },
  };
}

test("callable handler returns the payment-provider customer reference", async () => {
  const calls = [];
  const handlers = createPaymentCustomerHandlers({
    async createStripeCustomer(input) {
      calls.push(input);
      return "cus_callable_123";
    },
  });

  const result = await handlers.createPaymentCustomerHandler(
    authenticatedRequest("caller-1"),
  );

  assert.equal(result, "cus_callable_123");
  assert.deepEqual(calls, [{
    internalReference: "caller-1",
    email: "client@example.com",
  }]);
});

test("callable binds the payment customer to the authenticated user", async () => {
  let createCalls = 0;
  const handlers = createPaymentCustomerHandlers({
    async createStripeCustomer() {
      createCalls += 1;
    },
  });

  await assert.rejects(
    () => handlers.createPaymentCustomerHandler(
      authenticatedRequest("another-user"),
    ),
    (error) => error.code === "permission-denied",
  );
  assert.equal(createCalls, 0);
});

test("callable handler requires authentication", async () => {
  const handlers = createPaymentCustomerHandlers();

  await assert.rejects(
    () => handlers.createPaymentCustomerHandler({
      data: {
        inputReference: "client-456",
        email: "client@example.com",
      },
    }),
    (error) => error.code === "unauthenticated",
  );
});

test("callable handler requires an input reference", async () => {
  const handlers = createPaymentCustomerHandlers();

  await assert.rejects(
    () => handlers.createPaymentCustomerHandler(
      authenticatedRequest(" "),
    ),
    (error) => error.code === "invalid-argument",
  );
});

test("callable handler requires a valid email", async () => {
  const handlers = createPaymentCustomerHandlers();

  await assert.rejects(
    () => handlers.createPaymentCustomerHandler(
      authenticatedRequest("client-456", "invalid-email"),
    ),
    (error) => error.code === "invalid-argument",
  );
});

test("callable handler deletes and returns a customer reference", async () => {
  const calls = [];
  const handlers = createPaymentCustomerHandlers({
    async deleteStripeCustomer(input) {
      calls.push(input);
      return input.customerReference;
    },
  });

  const result = await handlers.deleteCustomerHandler({
    auth: {uid: "caller-1"},
    data: {customerReference: "cus_delete_456"},
  });

  assert.equal(result, "cus_delete_456");
  assert.deepEqual(calls, [{
    customerReference: "cus_delete_456",
  }]);
});

test("delete callable requires a customer reference", async () => {
  const handlers = createPaymentCustomerHandlers();

  await assert.rejects(
    () => handlers.deleteCustomerHandler({
      auth: {uid: "caller-1"},
      data: {customerReference: " "},
    }),
    (error) => error.code === "invalid-argument",
  );
});

test("Functions index exports payment customer callables", () => {
  const indexPath = require.resolve("./index");
  const paymentCustomerPath = require.resolve("./payment_customer");
  const cachedPaymentCustomer = require.cache[paymentCustomerPath];

  require.cache[paymentCustomerPath] = {
    id: paymentCustomerPath,
    filename: paymentCustomerPath,
    loaded: true,
    exports: {
      createPaymentCustomer: "callable",
      deleteCustomer: "delete-callable",
    },
  };
  delete require.cache[indexPath];

  try {
    const index = require("./index");

    assert.equal(index.createPaymentCustomer, "callable");
    assert.equal(index.deleteCustomer, "delete-callable");
  } finally {
    delete require.cache[indexPath];

    if (cachedPaymentCustomer) {
      require.cache[paymentCustomerPath] = cachedPaymentCustomer;
    } else {
      delete require.cache[paymentCustomerPath];
    }
  }
});
