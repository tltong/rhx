const assert = require("node:assert/strict");
const {test} = require("node:test");
const {makeStripeWebhookFixture, NOW, END, unix} = require("../stripe_payment_subscription/test_support/stripe_webhook_fixture");

test("billing invoice context returns covered dates, paid amounts and attempts without a client secret", async () => {
  const f = await makeStripeWebhookFixture();
  f.state.intent.status = "requires_action";
  const result = await f.stripe.retrieveInvoicePaymentContext("in_initial", {includeBillingDetails: true});
  assert.deepEqual(result.billingPeriodStart, NOW);
  assert.deepEqual(result.billingPeriodEnd, END);
  assert.equal(result.amountPaid, 0);
  assert.equal(result.attemptCount, 0);
  assert.equal(result.currencyExponent, 2);
  assert.equal(result.paymentClientSecret, null);
});

test("line pagination checks later billing periods before granting any coverage", async () => {
  const f = await makeStripeWebhookFixture();
  const first = f.state.invoice.lines.data[0];
  f.state.invoice.lines.has_more = true;
  const calls = [];
  f.stripe.stripeClient.invoices.listLineItems = async (id, input) => {
    calls.push({id, input});
    if (!input.starting_after) return {data: [first], has_more: true};
    return {data: [{...structuredClone(first), id: "il_second", period: {start: unix(END), end: unix(new Date("2026-12-01Z"))}}], has_more: false};
  };
  const result = await f.stripe.retrieveInvoicePaymentContext("in_initial", {includeBillingDetails: true});
  assert.equal(result.billingPeriodStart, null);
  assert.equal(result.billingPeriodEnd, null);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].input.starting_after, "il_one");
});

test("legacy subscription lines are supported and unrelated lines never provide coverage", async () => {
  const f = await makeStripeWebhookFixture();
  f.state.invoice.lines.data = [{id: "il_legacy", type: "subscription", subscription: "sub_one", proration: false,
    period: {start: unix(NOW), end: unix(END)}}];
  assert.deepEqual((await f.stripe.retrieveInvoicePaymentContext("in_initial", {includeBillingDetails: true})).billingPeriodEnd, END);
  f.state.invoice.lines.data[0].subscription = "sub_other";
  assert.equal((await f.stripe.retrieveInvoicePaymentContext("in_initial", {includeBillingDetails: true})).billingPeriodEnd, null);
});

test("paid credit-only invoices without a PaymentIntent retain their paid timestamp and coverage", async () => {
  const f = await makeStripeWebhookFixture(); f.state.invoice.amount_due = 0; f.pay();
  f.state.invoice.confirmation_secret = null;
  const result = await f.stripe.retrieveInvoicePaymentContext("in_initial", {includeBillingDetails: true});
  assert.equal(result.paymentIntentReference, null);
  assert.equal(result.invoiceStatus, "paid");
  assert.deepEqual(result.paidAt, NOW);
  assert.deepEqual(result.billingPeriodEnd, END);
});

test("currency minor-unit conversions include zero-decimal and Stripe's special ISK/UGX rules", async () => {
  const f = await makeStripeWebhookFixture();
  for (const [currency, exponent] of [["jpy", 0], ["myr", 2], ["kwd", 3], ["isk", 2], ["ugx", 2]]) {
    f.state.invoice.currency = currency;
    assert.equal((await f.stripe.retrieveInvoicePaymentContext("in_initial", {includeBillingDetails: true})).currencyExponent, exponent);
  }
});
