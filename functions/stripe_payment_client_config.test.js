const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStripePaymentClientConfigHandlers,
} = require("./stripe_payment_client_config");

function authenticatedRequest() {
  return {
    auth: {
      uid: "caller-1",
    },
    data: {},
  };
}

test("Stripe client config callable returns the active publishable key", async () => {
  const calls = [];
  const handlers = createStripePaymentClientConfigHandlers({
    async loadPaymentConfig() {
      calls.push(["config"]);
      return {
        provider: "stripe",
        mode: "test",
      };
    },
    loadPublishableKey(input) {
      calls.push(["key", input]);
      return "pk_test_example";
    },
  });

  const result = await handlers.getStripeClientConfigHandler(
    authenticatedRequest(),
  );

  assert.deepEqual(result, {
    provider: "stripe",
    mode: "test",
    publishableKey: "pk_test_example",
  });
  assert.deepEqual(calls, [
    ["config"],
    ["key", {mode: "test"}],
  ]);
});

test("Stripe client config callable requires authentication", async () => {
  const handlers = createStripePaymentClientConfigHandlers();

  await assert.rejects(
    () => handlers.getStripeClientConfigHandler({data: {}}),
    (error) => error.code === "unauthenticated",
  );
});

test("Stripe client config callable rejects another provider", async () => {
  const handlers = createStripePaymentClientConfigHandlers({
    async loadPaymentConfig() {
      return {
        provider: "another-provider",
        mode: "test",
      };
    },
    loadPublishableKey() {
      return "pk_test_unused";
    },
  });

  await assert.rejects(
    () => handlers.getStripeClientConfigHandler(authenticatedRequest()),
    /configured payment provider is not Stripe/,
  );
});

test("Functions index exports getStripeClientConfig", () => {
  assert.equal(
    typeof require("./index").getStripeClientConfig,
    "function",
  );
});
