const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStripeProdWebhookHandlers,
  getStripeSignature,
} = require("./stripe_prod_webhook");

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

test("production signature is read from Express or plain request headers", () => {
  assert.equal(getStripeSignature({
    get(name) {
      return name === "stripe-signature" ? " signature-from-get " : null;
    },
  }), "signature-from-get");
  assert.equal(getStripeSignature({
    headers: {"stripe-signature": ["signature-from-header"]},
  }), "signature-from-header");
});

test("production webhook verifies and processes a production Stripe event", async () => {
  const calls = [];
  const event = {
    id: "evt_live_setup",
    type: "setup_intent.succeeded",
  };
  const {stripeProdWebhookHandler} = createStripeProdWebhookHandlers({
    constructWebhookEvent(input) {
      calls.push(["verify", input]);
      return event;
    },
    async processSetupIntentEvent(input) {
      calls.push(["process", input]);
      return {handled: true};
    },
    readWebhookSecret: () => "whsec_prod_value",
    eventLogger: silentLogger,
  });
  const rawBody = Buffer.from("{\"id\":\"evt_live_setup\"}");
  const response = createResponse();

  await stripeProdWebhookHandler({
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
      webhookSecret: "whsec_prod_value",
    }],
    ["process", {mode: "prod", event}],
  ]);
});

test("production webhook routes invoice.paid to subscription processing", async () => {
  const calls = [];
  const event = {
    id: "evt_live_invoice",
    type: "invoice.paid",
  };
  const {stripeProdWebhookHandler} = createStripeProdWebhookHandlers({
    constructWebhookEvent: () => event,
    async processSetupIntentEvent(input) {
      calls.push(["setup", input]);
      return {handled: false};
    },
    async processSubscriptionEvent(input) {
      calls.push(["subscription", input]);
      return {handled: true};
    },
    readWebhookSecret: () => "whsec_prod_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeProdWebhookHandler({
    method: "POST",
    rawBody: Buffer.from("{}"),
    headers: {"stripe-signature": "valid-signature"},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {received: true, handled: true});
  assert.deepEqual(calls, [
    ["setup", {mode: "prod", event}],
    ["subscription", {mode: "prod", event}],
  ]);
});

test("production webhook acknowledges unsupported Stripe events", async () => {
  const event = {
    id: "evt_live_unknown",
    type: "charge.updated",
  };
  const {stripeProdWebhookHandler} = createStripeProdWebhookHandlers({
    constructWebhookEvent: () => event,
    processSetupIntentEvent: async () => ({handled: false}),
    processSubscriptionEvent: async () => ({handled: false}),
    readWebhookSecret: () => "whsec_prod_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeProdWebhookHandler({
    method: "POST",
    rawBody: Buffer.from("{}"),
    headers: {"stripe-signature": "valid-signature"},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {received: true, handled: false});
});

test("production webhook rejects an invalid Stripe signature", async () => {
  let processingCalls = 0;
  const {stripeProdWebhookHandler} = createStripeProdWebhookHandlers({
    constructWebhookEvent() {
      throw new Error("Signature verification failed.");
    },
    async processSetupIntentEvent() {
      processingCalls += 1;
    },
    readWebhookSecret: () => "whsec_prod_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeProdWebhookHandler({
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

test("production webhook returns 500 when event processing fails", async () => {
  const {stripeProdWebhookHandler} = createStripeProdWebhookHandlers({
    constructWebhookEvent: () => ({
      id: "evt_live_processing_failure",
      type: "setup_intent.succeeded",
    }),
    async processSetupIntentEvent() {
      throw new Error("Firestore is unavailable.");
    },
    readWebhookSecret: () => "whsec_prod_value",
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeProdWebhookHandler({
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

test("production webhook rejects non-POST requests", async () => {
  const {stripeProdWebhookHandler} = createStripeProdWebhookHandlers({
    eventLogger: silentLogger,
  });
  const response = createResponse();

  await stripeProdWebhookHandler({method: "GET"}, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "POST");
});
