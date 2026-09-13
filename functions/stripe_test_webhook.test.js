const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStripeTestWebhookHandlers,
  getStripeSignature,
} = require("./stripe_test_webhook");

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const silentLogger = Object.freeze({
  info() {},
  warn() {},
  error() {},
});

test("Stripe signature is read from Express or plain request headers", () => {
  assert.equal(getStripeSignature({
    get(name) {
      return name === "stripe-signature" ? " signature-from-get " : null;
    },
  }), "signature-from-get");
  assert.equal(getStripeSignature({
    headers: {"stripe-signature": ["signature-from-header"]},
  }), "signature-from-header");
});

test("test webhook verifies and processes a Stripe event", async () => {
  const calls = [];
  const event = {
    id: "evt_test_setup",
    type: "setup_intent.succeeded",
  };
  const {stripeTestWebhookHandler} = createStripeTestWebhookHandlers({
    constructWebhookEvent(input) {
      calls.push(["verify", input]);
      return event;
    },
    async processSetupIntentEvent(input) {
      calls.push(["process", input]);
      return {handled: true};
    },
    readWebhookSecret: () => "whsec_test_value",
    eventLogger: silentLogger,
  });
  const rawBody = Buffer.from("{\"id\":\"evt_test_setup\"}");
  const response = createResponse();

  await stripeTestWebhookHandler({
    method: "POST",
    rawBody,
    headers: {"stripe-signature": "stripe-signature-value"},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {received: true, handled: true});
  assert.deepEqual(calls, [
    ["verify", {
      payload: rawBody,
      signature: "stripe-signature-value",
      webhookSecret: "whsec_test_value",
    }],
    ["process", {mode: "test", event}],
  ]);
});

test("test webhook routes payment action events to subscription processing", async () => {
  const calls = [];
  const event = {
    id: "evt_test_invoice",
    type: "invoice.payment_action_required",
  };
  const {stripeTestWebhookHandler} = createStripeTestWebhookHandlers({
    constructWebhookEvent: () => event,
    async processSetupIntentEvent(input) {
      calls.push(["setup", input]);
      return {handled: false};
    },
    async processSubscriptionEvent(input) {
      calls.push(["subscription", input]);
      return {handled: true};
    },
    readWebhookSecret: () => "whsec_test_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeTestWebhookHandler({
    method: "POST",
    rawBody: Buffer.from("{}"),
    headers: {"stripe-signature": "valid-signature"},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {received: true, handled: true});
  assert.deepEqual(calls, [
    ["setup", {mode: "test", event}],
    ["subscription", {mode: "test", event}],
  ]);
});

test("test webhook acknowledges unsupported Stripe events", async () => {
  const event = {
    id: "evt_test_unknown",
    type: "charge.updated",
  };
  const {stripeTestWebhookHandler} = createStripeTestWebhookHandlers({
    constructWebhookEvent: () => event,
    processSetupIntentEvent: async () => ({handled: false}),
    processSubscriptionEvent: async () => ({handled: false}),
    readWebhookSecret: () => "whsec_test_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeTestWebhookHandler({
    method: "POST",
    rawBody: Buffer.from("{}"),
    headers: {"stripe-signature": "valid-signature"},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {received: true, handled: false});
});

test("test webhook rejects an invalid Stripe signature", async () => {
  let processingCalls = 0;
  const {stripeTestWebhookHandler} = createStripeTestWebhookHandlers({
    constructWebhookEvent() {
      throw new Error("Signature verification failed.");
    },
    async processSetupIntentEvent() {
      processingCalls += 1;
    },
    readWebhookSecret: () => "whsec_test_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeTestWebhookHandler({
    method: "POST",
    rawBody: Buffer.from("{}"),
    headers: {"stripe-signature": "invalid-signature"},
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    received: false,
    message: "Invalid Stripe webhook signature.",
  });
  assert.equal(processingCalls, 0);
});

test("test webhook returns 500 when verified event processing fails", async () => {
  const {stripeTestWebhookHandler} = createStripeTestWebhookHandlers({
    constructWebhookEvent: () => ({
      id: "evt_processing_failure",
      type: "setup_intent.succeeded",
    }),
    async processSetupIntentEvent() {
      throw new Error("Firestore is unavailable.");
    },
    readWebhookSecret: () => "whsec_test_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeTestWebhookHandler({
    method: "POST",
    rawBody: Buffer.from("{}"),
    headers: {"stripe-signature": "valid-signature"},
  }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    received: false,
    message: "Stripe webhook processing failed.",
  });
});

test("test webhook rejects non-POST requests", async () => {
  const {stripeTestWebhookHandler} = createStripeTestWebhookHandlers({
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeTestWebhookHandler({method: "GET"}, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "POST");
});
