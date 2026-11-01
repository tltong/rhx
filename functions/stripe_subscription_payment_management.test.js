const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createStripeSubscriptionHandlers} = require("./stripe_payment_subscription");
const {createStripeSetupIntentHandlers} = require("./stripe_payment_setup_intent");
const request = {auth: {uid: "verified-owner"}, data: {subscriptionReference: "sub_owner",
  setupIntentReference: "seti_done", idempotencyReference: "attempt", internalReference: "forged-owner", paymentMethodReference: "forged-card"}};
const result = {subscriptionReference: "sub_owner", subscriptionStatus: "active", canChangeCard: true,
  currentCard: {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030, fullNumber: "private"},
  paymentState: "paid", linkedInvoiceIsCurrent: true, renewal: null};

test("subscription status allows bounded cold-start time for the backend", () => {
  assert.equal(require("./stripe_payment_subscription").getStripeSubscriptionPaymentDetails.__endpoint.timeoutSeconds, 120);
});

test("management callables derive identity and whitelist card-update fields", async () => {
  const calls = [];
  const handlers = createStripeSubscriptionHandlers({
    async getSubscriptionPaymentDetails(input) {calls.push(input); return result;},
    async updateSubscriptionCard(input) {calls.push(input); return result;}});
  const data = await handlers.getStripeSubscriptionPaymentDetailsHandler(request);
  await handlers.updateStripeSubscriptionPaymentMethodHandler(request);
  assert.deepEqual(calls, [{internalReference: "verified-owner", subscriptionReference: "sub_owner"},
    {internalReference: "verified-owner", subscriptionReference: "sub_owner", setupIntentReference: "seti_done"}]);
  assert.equal(data.currentCard.fullNumber, undefined);
  await assert.rejects(() => handlers.updateStripeSubscriptionPaymentMethodHandler({data: request.data}), e => e.code === "unauthenticated");
});

test("subscription card setup callable resolves customer server-side and preserves permission errors", async () => {
  let input;
  const handlers = createStripeSetupIntentHandlers({async createSubscriptionCardSetup(value) {
    input = value; return {setupIntentReference: "seti_new", clientSecret: "seti_new_secret_private"};}});
  await handlers.createStripeSetupIntentHandler(request);
  assert.deepEqual(input, {internalReference: "verified-owner", subscriptionReference: "sub_owner", idempotencyReference: "attempt"});
  const forbidden = createStripeSetupIntentHandlers({async createSubscriptionCardSetup() {throw Object.assign(Error("Unavailable"), {code: "not-found"});}});
  await assert.rejects(() => forbidden.createStripeSetupIntentHandler(request), e => e.code === "not-found");
});

test("invalid subscription setup and card-update requests never enter business logic", async () => {
  let calls = 0;
  const setup = createStripeSetupIntentHandlers({async createSubscriptionCardSetup() {calls++;}});
  for (const patch of [{subscriptionReference: "bad"}, {idempotencyReference: ""}]) {
    await assert.rejects(() => setup.createStripeSetupIntentHandler({...request, data: {...request.data, ...patch}}), e => e.code === "invalid-argument");
  }
  const update = createStripeSubscriptionHandlers({async updateSubscriptionCard() {calls++;}});
  await assert.rejects(() => update.updateStripeSubscriptionPaymentMethodHandler({...request, data: {...request.data, setupIntentReference: "bad"}}), e => e.code === "invalid-argument");
  assert.equal(calls, 0);
});


test("card setup and update callables forward validated family scope and reject invalid scope", async () => {
  const calls = [];
  const setup = createStripeSetupIntentHandlers({async createSubscriptionCardSetup(value) {
    calls.push(value); return {setupIntentReference: "seti_new", clientSecret: "private"};}});
  const update = createStripeSubscriptionHandlers({async updateSubscriptionCard(value) {calls.push(value); return result;}});
  const family = {...request, data: {...request.data, cardChangeScope: "all_students", subscriptionReferences: ["sub_forged"]}};
  await setup.createStripeSetupIntentHandler(family);
  await update.updateStripeSubscriptionPaymentMethodHandler(family);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.cardChangeScope === "all_students" && c.internalReference === "verified-owner" && !c.subscriptionReferences));
  for (const cardChangeScope of ["other", null, ["all_students"]]) {
    const invalid = {...request, data: {...request.data, cardChangeScope}};
    await assert.rejects(() => setup.createStripeSetupIntentHandler(invalid), e => e.code === "invalid-argument");
    await assert.rejects(() => update.updateStripeSubscriptionPaymentMethodHandler(invalid), e => e.code === "invalid-argument");
  }
  assert.equal(calls.length, 2);
});
