const assert = require("node:assert/strict");
const {test} = require("node:test");
const {StripePayment} = require("../stripe_payment/domain/stripe_payment");
const {GetStripeSubscriptionPaymentAction} =
  require("./application/get_stripe_subscription_payment_action");
const {RetryStripeSubscriptionInvoicePayment} =
  require("./application/retry_stripe_subscription_invoice_payment");
const {ProcessStripeSubscriptionEvent} =
  require("./application/process_stripe_subscription_event");

const {fixture} = require("./test_support/stripe_invoice_fixture");
const input = {internalReference: "owner", subscriptionReference: "sub_owner",
  invoiceReference: "in_due", idempotencyReference: "explicit-attempt-1"};

test("loads live invoice and masked saved card without attempting payment", async () => {
  const {state, get} = fixture();
  const result = await get.execute({internalReference: "owner", subscriptionReference: "sub_owner"});
  assert.equal(result.invoiceReference, "in_due");
  assert.equal(result.action, "retry_payment");
  assert.equal(result.canRetry, true);
  assert.equal(result.amountDue, 2500);
  assert.deepEqual(result.savedCard, {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030});
  assert.equal(result.paymentClientSecret, null);
  assert.equal(state.charges, 0);
  assert.ok(!JSON.stringify(result).includes("pm_"));
});

test("same-card retry pays exact invoice using server-selected card in test and prod", async () => {
  for (const mode of ["test", "prod"]) {
    const {state, retry} = fixture(mode);
    const result = await retry.execute({...input, paymentMethodReference: "pm_attacker", amount: 1});
    assert.equal(result.action, "complete");
    assert.equal(result.amountDue, 0);
    assert.equal(result.subscriptionStatus, "active");
    assert.equal(result.paymentClientSecret, null);
    assert.equal(state.charges, 1);
    const call = state.calls.find(c => c[0] === "pay");
    assert.equal(call[1], "in_due");
    assert.deepEqual(call[2], {payment_method: "pm_saved", off_session: false});
    assert.match(call[3].idempotencyKey, /^retry-subscription-invoice-[a-f0-9]{64}$/);
    await retry.execute(input);
    assert.equal(state.charges, 1);
  }
});

test("decline exposes safe reason; transport replay reuses key; fresh explicit retry can pay", async () => {
  const {state, retry} = fixture();
  state.behavior = "declined";
  const first = await retry.execute(input);
  const replay = await retry.execute(input);
  assert.equal(first.action, "retry_payment");
  assert.equal(first.failureCode, "insufficient_funds");
  assert.deepEqual(replay, first);
  assert.equal(state.charges, 1);
  assert.ok(!JSON.stringify(first).includes("sensitive"));
  const keys = state.calls.filter(c => c[0] === "pay").map(c => c[3].idempotencyKey);
  assert.equal(keys[0], keys[1]);
  state.behavior = "paid";
  assert.equal((await retry.execute({...input, idempotencyReference: "new-explicit-attempt"})).action, "complete");
  assert.equal(state.charges, 2);
});

test("3DS-required invoice returns secret and further retries never resubmit it", async () => {
  const {state, retry} = fixture();
  state.behavior = "authentication";
  const action = await retry.execute(input);
  assert.equal(action.action, "confirm_payment");
  assert.equal(action.paymentClientSecret, "pi_due_secret_private");
  assert.equal(action.canRetry, false);
  await retry.execute({...input, idempotencyReference: "another-attempt"});
  assert.equal(state.charges, 1);
  state.intent.status = "succeeded";
  state.invoice.status = "paid";
  state.invoice.amount_remaining = 0;
  assert.equal((await retry.execute(input)).action, "complete");
  assert.equal(state.charges, 1);
});

test("paid, processing, and succeeded-but-unsettled invoice do not charge again", async () => {
  for (const [invoiceStatus, paymentStatus, action] of [
    ["paid", "succeeded", "complete"], ["open", "processing", "wait"],
    ["open", "succeeded", "wait"],
  ]) {
    const {state, retry} = fixture();
    state.invoice.status = invoiceStatus;
    state.intent.status = paymentStatus;
    assert.equal((await retry.execute(input)).action, action);
    assert.equal(state.charges, 0);
  }
});

test("void, draft, uncollectible, and zero-remaining invoices cannot be retried", async () => {
  for (const status of ["void", "draft", "uncollectible", "open"]) {
    const {state, retry} = fixture();
    state.invoice.status = status;
    if (status === "open") state.invoice.amount_remaining = 0;
    assert.equal((await retry.execute(input)).canRetry, false);
    assert.equal(state.charges, 0);
  }
});

test("canceled, expired, paused, and manually collected subscriptions cannot charge", async () => {
  for (const status of ["canceled", "incomplete_expired", "paused", "trialing", "active"]) {
    const {state, retry} = fixture();
    state.subscription.status = status;
    if (status === "active") state.subscription.pause_collection = {behavior: "void"};
    assert.equal((await retry.execute(input)).canRetry, false);
    assert.equal(state.charges, 0);
  }
  const {state, retry} = fixture();
  state.invoice.collection_method = "send_invoice";
  assert.equal((await retry.execute(input)).canRetry, false);
  assert.equal(state.charges, 0);
});

test("owner and registration checks precede Stripe reads and mutations", async () => {
  for (const field of ["owner", "registered"]) {
    const {state, retry} = fixture();
    state[field] = false;
    await assert.rejects(() => retry.execute(input), e => e.code === "not-found");
    assert.equal(state.calls.length, 0);
  }
});

test("invoice, subscription, and card ownership mismatches never charge", async () => {
  for (const [target, field, value] of [
    ["invoice", "customer", "cus_other"], ["invoice", "subscription", "sub_other"],
    ["subscription", "customer", "cus_other"], ["method", "customer", "cus_other"],
    ["intent", "customer", "cus_other"], ["invoice", "id", "in_other"],
  ]) {
    const {state, retry} = fixture();
    state[target][field] = value;
    await assert.rejects(() => retry.execute(input));
    assert.equal(state.charges, 0);
  }
});

test("current subscription card takes priority over an older invoice card and shows remaining balance", async () => {
  const {state, get} = fixture();
  state.invoice.default_payment_method = "pm_invoice";
  state.invoice.amount_remaining = 900;
  const result = await get.execute(input);
  assert.equal(result.amountDue, 900);
  assert.ok(state.calls.some(c => c[0] === "method" && c[1] === "pm_saved"));
});

test("missing card or permanent card failure offers replacement without charging", async () => {
  for (const change of ["missing", "expired", "non-card"]) {
    const {state, retry} = fixture();
    if (change === "missing") state.subscription.default_payment_method = null;
    if (change === "expired") state.intent.last_payment_error = {code: "expired_card"};
    if (change === "non-card") state.method.type = "sepa_debit";
    assert.equal((await retry.execute(input)).action, "replace_payment_method");
    assert.equal(state.charges, 0);
  }
});

test("lost successful response is reconciled without another attempt", async () => {
  const {state, retry} = fixture();
  state.behavior = "lost-response";
  assert.equal((await retry.execute(input)).action, "complete");
  assert.equal(state.charges, 1);
});

test("unavailable post-payment read fails safely then resolves paid on refresh", async () => {
  const {state, retry, get} = fixture();
  state.behavior = "read-failure";
  await assert.rejects(() => retry.execute(input), e => e.code === "unavailable");
  state.readFailure = false;
  assert.equal((await get.execute(input)).action, "complete");
  assert.equal(state.charges, 1);
});

test("concurrent transport requests settle the same Stripe invoice once", async () => {
  for (const differentKeys of [false, true]) {
    const {state, retry} = fixture();
    let release;
    state.gate = new Promise(resolve => {release = resolve;});
    const first = retry.execute(input);
    const second = retry.execute({...input,
      idempotencyReference: differentKeys ? "other-tab" : input.idempotencyReference});
    await new Promise(resolve => setImmediate(resolve));
    release();
    const results = await Promise.all([first, second]);
    assert.ok(results.every(r => r.action === "complete"));
    assert.equal(state.charges, 1);
  }
});

test("invalid references and missing attempt identifiers are rejected before payment", async () => {
  for (const changes of [{invoiceReference: ""}, {invoiceReference: "in_bad/path"},
    {subscriptionReference: "wrong"}, {internalReference: ""},
    {idempotencyReference: ""}, {idempotencyReference: "x".repeat(501)}]) {
    const {state, retry} = fixture();
    await assert.rejects(() => retry.execute({...input, ...changes}));
    assert.equal(state.charges, 0);
  }
});

test("old links stay pinned: paid arrears show paid and older unpaid invoices cannot charge", async () => {
  for (const paid of [false, true]) {
    const {state, retry} = fixture();
    state.subscription.latest_invoice = "in_new_renewal";
    if (paid) {state.invoice.status = "paid"; state.invoice.amount_remaining = 0;}
    const result = await retry.execute(input);
    assert.equal(result.invoiceReference, "in_due");
    assert.equal(result.action, paid ? "complete" : "unavailable");
    assert.equal(state.charges, 0);
  }
});

test("successful retry feeds subscription billing and preserves the invoice's original covered period", async () => {
  const {makeBillingFixture} = require("../syllabus_subscription/test_support/billing_fixture");
  const {state, stripe, retry} = fixture();
  const billing = makeBillingFixture();
  billing.memory.put("subscriptions/student-a", {subscriptionType: "trial", activeUntil: null,
    createdAt: new Date("2023-01-01Z"), updatedAt: new Date("2023-01-01Z")});
  Object.assign(state.invoice, {created: 1700000000, amount_paid: 0, attempt_count: 1, attempted: true,
    status_transitions: {paid_at: null}, lines: {data: [{type: "subscription", subscription: "sub_owner",
      period: {start: 1700000000, end: 1702592000}}], has_more: false}});
  await retry.execute(input);
  state.invoice.amount_paid = 2500; state.invoice.status_transitions.paid_at = 1700000000;
  const processor = new ProcessStripeSubscriptionEvent({createStripePayment: () => stripe,
    getCustomerRecordByReference: async () => ({internalReference: "owner"}),
    getSubscriptionRecord: async () => ({studentId: "student-a", planId: "monthly", interval: "month", intervalCount: 1}),
    recordInvoicePaymentEvent: value => billing.billing.recordInvoicePaymentEvent(value)});
  await processor.execute({mode: "test", event: {id: "evt_paid", created: 1700000000, type: "invoice.paid",
    data: {object: {...state.invoice, object: "invoice"}}}});
  assert.equal(billing.student().paymentSubscriptionReference, "sub_owner");
  assert.equal(billing.student().activeUntil.getTime(), 1702592000 * 1000);
  assert.equal(billing.receipts().length, 1);
  assert.equal(state.charges, 1);
});

test("retry rejects initial and plan-change invoices while initial 3DS lookup still works", async () => {
  for (const reason of ["subscription_create", "subscription_update", "manual", null]) {
    const {state, retry, get} = fixture();
    state.invoice.billing_reason = reason;
    state.subscription.status = "incomplete";
    await assert.rejects(() => retry.execute(input), e => e.code === "failed-precondition");
    assert.equal(state.charges, 0);
    assert.equal((await get.execute(input)).canRetry, false);
    state.intent.status = "requires_action";
    const action = await get.execute(input);
    assert.equal(action.action, "confirm_payment");
    assert.equal(action.billingReason, reason);
  }
});

test("renewal not yet attempted cannot be charged through retry", async () => {
  const {state, retry} = fixture();
  state.invoice.attempted = false;
  assert.equal((await retry.execute(input)).canRetry, false);
  assert.equal(state.charges, 0);
});
