const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPaymentCustomerHandlers,
} = require("./payment_customer");

function authenticatedRequest(inputReference) {
  return {
    auth: {
      uid: "caller-1",
    },
    data: {
      inputReference,
    },
  };
}

test("callable handler returns the payment-provider customer reference", async () => {
  const calls = [];
  const handlers = createPaymentCustomerHandlers({
    async createProvider() {
      return {
        async createCustomer(inputReference) {
          calls.push(inputReference);
          return "cus_callable_123";
        },
      };
    },
  });

  const result = await handlers.createPaymentCustomerHandler(
    authenticatedRequest("client-456"),
  );

  assert.equal(result, "cus_callable_123");
  assert.deepEqual(calls, ["client-456"]);
});

test("callable handler requires authentication", async () => {
  const handlers = createPaymentCustomerHandlers();

  await assert.rejects(
    () => handlers.createPaymentCustomerHandler({
      data: {inputReference: "client-456"},
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

test("callable handler deletes and returns a customer reference", async () => {
  const calls = [];
  const handlers = createPaymentCustomerHandlers({
    async createProvider() {
      return {
        async deleteCustomer(customerReference) {
          calls.push(customerReference);
          return customerReference;
        },
      };
    },
  });

  const result = await handlers.deleteCustomerHandler({
    auth: {uid: "caller-1"},
    data: {customerReference: "cus_delete_456"},
  });

  assert.equal(result, "cus_delete_456");
  assert.deepEqual(calls, ["cus_delete_456"]);
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
