const assert = require("node:assert/strict");
const {test} = require("node:test");
const {fixture} = require("./test_support/stripe_invoice_fixture");
const input = {internalReference: "owner", subscriptionReference: "sub_owner"};

function initialFixture(mode) {
  const f = fixture(mode);
  Object.assign(f.state.invoice, {billing_reason: "subscription_create", attempted: false});
  Object.assign(f.state.subscription, {status: "incomplete"});
  Object.assign(f.state.intent, {status: "requires_confirmation", payment_method: "pm_saved", last_payment_error: null});
  return f;
}

test("initial saved-card confirmation is owner-scoped and never submits payment on lookup", async () => {
  for (const mode of ["test", "prod"]) {
    const {state, get} = initialFixture(mode);
    const result = await get.execute(input);
    assert.equal(result.action, "confirm_payment");
    assert.equal(result.paymentStatus, "requires_confirmation");
    assert.equal(result.paymentClientSecret, "pi_due_secret_private");
    assert.equal(result.amountDue, 2500);
    assert.equal(result.canRetry, false);
    assert.equal(state.charges, 0);
    assert.ok(!state.calls.some(call => call[0] === "pay"));
    assert.ok(!JSON.stringify(result).includes("pm_saved"));
  }
});

test("initial confirmation requires an attached owned card matching the intent", async () => {
  for (const change of ["unbound", "different", "detached", "noncard", "missing_default"]) {
    const {state, get} = initialFixture();
    if (change === "unbound") state.intent.payment_method = null;
    if (change === "different") state.intent.payment_method = "pm_other";
    if (change === "detached") state.method.customer = null;
    if (change === "noncard") state.method.type = "link";
    if (change === "missing_default") state.subscription.default_payment_method = null;
    const result = await get.execute(input);
    assert.equal(result.action, "unavailable", change);
    assert.equal(result.paymentClientSecret, null, change);
    assert.equal(state.charges, 0);
  }
});

test("initial confirmation rejects other owners before Stripe reads", async () => {
  const {state, get} = initialFixture();
  state.owner = false;
  await assert.rejects(() => get.execute(input), error => error.code === "not-found");
  assert.equal(state.calls.length, 0);
  state.owner = true;
  state.method.customer = "cus_other";
  await assert.rejects(() => get.execute(input), error => error.code === "failed-precondition");
  assert.equal(state.charges, 0);
});

test("expired, stale, closed, and manually collected initial invoices expose no confirmation secret", async () => {
  for (const change of ["expired", "stale", "void", "uncollectible", "manual", "zero"]) {
    const {state, get} = initialFixture();
    if (change === "expired") state.subscription.status = "incomplete_expired";
    if (change === "stale") state.subscription.latest_invoice = "in_latest";
    if (["void", "uncollectible"].includes(change)) state.invoice.status = change;
    if (change === "manual") state.invoice.collection_method = "send_invoice";
    if (change === "zero") state.invoice.amount_remaining = 0;
    const result = await get.execute({...input, invoiceReference: "in_due"});
    assert.equal(result.action, "unavailable", change);
    assert.equal(result.paymentClientSecret, null, change);
    assert.equal(state.charges, 0);
  }
});

test("initial processing and paid states do not expose a charge action", async () => {
  for (const [status, invoiceStatus, action] of [["processing", "open", "wait"],
    ["succeeded", "open", "wait"], ["succeeded", "paid", "complete"]]) {
    const {state, get} = initialFixture();
    state.intent.status = status;
    state.invoice.status = invoiceStatus;
    const result = await get.execute(input);
    assert.equal(result.action, action);
    assert.equal(result.paymentClientSecret, null);
    assert.equal(state.charges, 0);
  }
});

test("requires-confirmation renewals retain backend retry and billing lookups suppress secrets", async () => {
  const {state, get} = fixture();
  Object.assign(state.intent, {status: "requires_confirmation", payment_method: "pm_saved"});
  const result = await get.execute(input);
  assert.equal(result.action, "retry_payment");
  assert.equal(result.paymentClientSecret, null);
  const initial = initialFixture();
  Object.assign(initial.state.invoice, {amount_paid: 0, attempt_count: 0, created: 1700000000});
  const context = await initial.stripe.retrieveInvoicePaymentContext("in_due", {includeBillingDetails: true});
  assert.equal(context.paymentClientSecret, null);
});
