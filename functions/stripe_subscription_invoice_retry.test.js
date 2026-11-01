const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createStripeSubscriptionHandlers, retryStripeSubscriptionPayment} =
  require("./stripe_payment_subscription");

const result = {action: "retry_payment", subscriptionReference: "sub_owner",
  invoiceReference: "in_due", paymentStatus: "requires_payment_method",
  paymentClientSecret: "must_be_removed", amountDue: 2500, currency: "myr",
  canRetry: true, savedCard: {brand: "visa", last4: "4242", expiryMonth: 12,
    expiryYear: 2030, fullNumber: "must_be_removed"}, failureCode: "insufficient_funds",
  invoiceStatus: "open", subscriptionStatus: "past_due", studentId: "student", planId: "monthly"};
const request = {auth: {uid: "verified-owner"}, data: {
  subscriptionReference: "sub_owner", invoiceReference: "in_due", idempotencyReference: "attempt",
  internalReference: "forged-owner", paymentMethodReference: "pm_forged", amount: 1}};

test("retry callable derives identity from authentication and whitelists input/output", async () => {
  let received;
  const handlers = createStripeSubscriptionHandlers({
    async retrySubscriptionInvoicePayment(input) {received = input; return result;},
  });
  const actual = await handlers.retryStripeSubscriptionPaymentHandler(request);
  assert.deepEqual(received, {internalReference: "verified-owner", subscriptionReference: "sub_owner",
    invoiceReference: "in_due", idempotencyReference: "attempt"});
  assert.equal(actual.paymentClientSecret, null);
  assert.equal(actual.savedCard.fullNumber, undefined);
  assert.equal(typeof retryStripeSubscriptionPayment.run, "function");
  assert.equal(retryStripeSubscriptionPayment.__endpoint.platform, "gcfv2");
});

test("retry callable rejects unauthenticated or invalid input before business logic", async () => {
  let calls = 0;
  const handlers = createStripeSubscriptionHandlers({async retrySubscriptionInvoicePayment() {calls++;}});
  await assert.rejects(() => handlers.retryStripeSubscriptionPaymentHandler({data: request.data}),
    e => e.code === "unauthenticated");
  for (const patch of [{subscriptionReference: "bad"}, {invoiceReference: "in_bad/path"},
    {invoiceReference: ""}, {idempotencyReference: ""}, {idempotencyReference: "x".repeat(501)}]) {
    await assert.rejects(() => handlers.retryStripeSubscriptionPaymentHandler({
      ...request, data: {...request.data, ...patch}}), e => e.code === "invalid-argument");
  }
  assert.equal(calls, 0);
});

test("retry callable preserves safe actionable errors and rejects mismatched results", async () => {
  for (const code of ["not-found", "permission-denied", "failed-precondition", "unavailable"]) {
    const handlers = createStripeSubscriptionHandlers({async retrySubscriptionInvoicePayment() {
      throw Object.assign(Error("safe message"), {code});
    }});
    await assert.rejects(() => handlers.retryStripeSubscriptionPaymentHandler(request), e => e.code === code);
  }
  const handlers = createStripeSubscriptionHandlers({async retrySubscriptionInvoicePayment() {
    return {...result, invoiceReference: "in_other"};
  }});
  await assert.rejects(() => handlers.retryStripeSubscriptionPaymentHandler(request), /unexpected invoice/);
});

test("payment-action callable accepts exact invoice and verifies the response matches", async () => {
  let input;
  const handlers = createStripeSubscriptionHandlers({async getSubscriptionPaymentAction(value) {
    input = value; return result;
  }});
  await handlers.getStripeSubscriptionPaymentActionHandler(request);
  assert.deepEqual(input, {internalReference: "verified-owner", subscriptionReference: "sub_owner", invoiceReference: "in_due"});
  await assert.rejects(() => handlers.getStripeSubscriptionPaymentActionHandler({
    ...request, data: {...request.data, invoiceReference: "in_other"}}), /unexpected invoiceReference/);
});
