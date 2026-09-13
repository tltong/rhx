const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStripeSetupIntentHandlers,
} = require("./stripe_payment_setup_intent");

function authenticatedRequest(customerReference) {
  return {
    auth: {
      uid: "caller-1",
    },
    data: {
      customerReference,
    },
  };
}

test("SetupIntent callable returns a client secret", async () => {
  const calls = [];
  const handlers = createStripeSetupIntentHandlers({
    async createPaymentSetupIntent(input) {
      calls.push(input);
      return "seti_secret_callable";
    },
  });

  const result = await handlers.createStripeSetupIntentHandler(
    authenticatedRequest("cus_setup_123"),
  );

  assert.equal(result, "seti_secret_callable");
  assert.deepEqual(calls, [{customerReference: "cus_setup_123"}]);
});

test("SetupIntent callable requires authentication", async () => {
  const handlers = createStripeSetupIntentHandlers();

  await assert.rejects(
    () => handlers.createStripeSetupIntentHandler({
      data: {customerReference: "cus_setup_123"},
    }),
    (error) => error.code === "unauthenticated",
  );
});

test("SetupIntent callable requires a customer reference", async () => {
  const handlers = createStripeSetupIntentHandlers();

  await assert.rejects(
    () => handlers.createStripeSetupIntentHandler(
      authenticatedRequest(" "),
    ),
    (error) => error.code === "invalid-argument",
  );
});

test("SetupIntent callable rejects a missing client secret", async () => {
  const handlers = createStripeSetupIntentHandlers({
    async createPaymentSetupIntent() {
      return "";
    },
  });

  await assert.rejects(
    () => handlers.createStripeSetupIntentHandler(
      authenticatedRequest("cus_setup_123"),
    ),
    /did not return a client secret/,
  );
});

test("Functions index exports createStripeSetupIntent", () => {
  assert.equal(
    typeof require("./index").createStripeSetupIntent,
    "function",
  );
});
