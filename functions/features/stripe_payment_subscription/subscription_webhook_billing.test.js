const assert = require("node:assert/strict");
const {test} = require("node:test");
const {makeStripeWebhookFixture, NOW, END, unix} = require("./test_support/stripe_webhook_fixture");

test("signed test/prod webhooks process all four initial/renewal outcomes through subscription billing", async () => {
  for (const mode of ["test", "prod"]) {
    const f = await makeStripeWebhookFixture({mode, registered: false});
    await f.checkout();
    assert.equal((await f.read()).paymentState, "unpaid");
    const trialEnd = f.student().activeUntil;
    f.fail();
    assert.equal((await f.deliver(f.event("invoice.payment_failed"))).statusCode, 200);
    assert.equal((await f.read()).paymentState, "failed");
    assert.equal(f.student().subscriptionType, "trial");
    assert.deepEqual(f.student().activeUntil, trialEnd);
    f.pay();
    assert.equal((await f.deliver(f.event("invoice.paid"))).statusCode, 200);
    assert.deepEqual(f.student().activeUntil, END);
    assert.equal(f.receipts().length, 1);
    f.now = END;
    Object.assign(f.state.invoice, {id: "in_renewal", billing_reason: "subscription_cycle", created: unix(END),
      status: "open", amount_paid: 0, amount_remaining: 2500, status_transitions: {paid_at: null}});
    f.state.invoice.lines.data[0].period = {start: unix(END), end: unix(new Date("2026-12-01Z"))};
    f.state.subscription.latest_invoice = "in_renewal";
    f.state.subscription.current_period_start = unix(END);
    f.state.subscription.current_period_end = unix(new Date("2026-12-01Z"));
    f.fail();
    const failure = f.event("invoice.payment_failed");
    assert.equal((await f.deliver(failure)).statusCode, 200);
    assert.equal((await f.read("in_renewal")).paymentState, "failed");
    assert.equal(f.student().billingSummary.failureCode, "insufficient_funds");
    assert.deepEqual(f.student().activeUntil, END);
    f.pay();
    const success = f.event("invoice.paid");
    assert.equal((await f.deliver(success)).statusCode, 200);
    assert.deepEqual(f.student().activeUntil, new Date("2026-12-01Z"));
    assert.equal(f.receipts().length, 2);
    await f.deliver(success); await f.deliver(failure);
    assert.equal((await f.read("in_renewal")).paymentState, "paid");
    assert.equal(f.receipts().length, 2);
    assert.equal(JSON.stringify([...f.memory.store.values()]).includes("_secret_"), false);
  }
});

test("authentication/processing are distinct from failure, including delayed failure events", async () => {
  const f = await makeStripeWebhookFixture();
  f.state.intent.status = "requires_action"; f.state.invoice.attempted = true;
  await f.process(f.event("invoice.payment_action_required"));
  assert.equal((await f.read()).paymentState, "authentication_required");
  f.state.intent.status = "processing";
  await f.process(f.event("invoice.payment_failed"));
  assert.equal((await f.read()).paymentState, "processing");
  f.state.intent.status = "succeeded";
  await f.process(f.event("invoice.paid"));
  assert.equal((await f.read()).paymentState, "processing");
  assert.equal(f.receipts().length, 0);
});

test("invoice.updated refreshes retry scheduling and lifecycle changes read current Stripe state", async () => {
  const f = await makeStripeWebhookFixture(); f.state.invoice.billing_reason = "subscription_cycle"; f.fail();
  await f.process(f.event("invoice.payment_failed"));
  f.state.invoice.next_payment_attempt = unix(END);
  await f.process(f.event("invoice.updated"));
  assert.deepEqual(f.student().billingSummary.nextPaymentAttemptAt, END);
  f.state.subscription.status = "unpaid";
  await f.process(f.event("customer.subscription.updated"));
  assert.equal(f.student().billingSummary.subscriptionStatus, "unpaid");
  f.state.subscription.status = "canceled";
  await f.process(f.event("customer.subscription.deleted"));
  assert.equal(f.student().billingSummary.subscriptionStatus, "canceled");
});

test("old paid invoice grants its own coverage rather than the subscription's newer unpaid period", async () => {
  const f = await makeStripeWebhookFixture();
  f.state.subscription.current_period_end = unix(new Date("2027-01-01Z"));
  f.pay();
  await f.process(f.event("invoice.paid"));
  assert.deepEqual(f.student().activeUntil, END);
});

test("proration/ambiguous invoice lines cannot grant an unrelated period", async () => {
  for (const change of ["proration", "multiple-periods"]) {
    const f = await makeStripeWebhookFixture();
    if (change === "proration") f.state.invoice.lines.data[0].parent.subscription_item_details.proration = true;
    else f.state.invoice.lines.data.push({...structuredClone(f.state.invoice.lines.data[0]), id: "il_other", period: {start: unix(END), end: unix(new Date("2026-12-01Z"))}});
    f.pay(); await f.process(f.event("invoice.paid"));
    assert.equal((await f.read()).paymentState, "paid");
    assert.equal(f.student().subscriptionType, "trial");
    assert.equal(f.receipts().length, 0);
  }
});

test("failed card-metadata projection retries safely after the billing event already committed", async () => {
  const f = await makeStripeWebhookFixture(); f.pay(); f.state.method.customer = "cus_wrong";
  const event = f.event("invoice.paid");
  assert.equal((await f.deliver(event)).statusCode, 500);
  assert.equal(f.receipts().length, 1);
  f.state.method.customer = "cus_one";
  assert.equal((await f.deliver(event)).statusCode, 200);
  assert.equal(f.receipts().length, 1);
});

test("invalid signatures, wrong mode and customer/invoice mismatches have no billing effects", async () => {
  const f = await makeStripeWebhookFixture(); f.pay();
  assert.equal((await f.deliver(f.event("invoice.paid"), true)).statusCode, 400);
  assert.equal(await f.read(), null);
  await assert.rejects(() => f.process({...f.event("invoice.paid"), livemode: false}), /mode/);
  const event = f.event("invoice.paid"); f.state.invoice.customer = "cus_other";
  await assert.rejects(() => f.process(event), /ownership|customer/);
  assert.equal(await f.read(), null);
});

test("unregistered checkout returns retryable failure then succeeds after registration", async () => {
  const f = await makeStripeWebhookFixture({registered: false}); f.pay();
  const event = f.event("invoice.paid");
  assert.equal((await f.deliver(event)).statusCode, 500);
  await f.checkout();
  assert.equal((await f.deliver(event)).statusCode, 200);
  assert.equal(f.receipts().length, 1);
});

test("idempotent checkout replay returns live details without replacing paid invoice/receipt/access", async () => {
  const f = await makeStripeWebhookFixture({registered: false});
  await f.checkout(); f.pay(); await f.process(f.event("invoice.paid"));
  const invoice = await f.read(), student = f.student(), receipt = f.receipts();
  const result = await f.checkout();
  assert.equal(result.status, "active"); assert.equal(result.paymentClientSecret, null);
  assert.deepEqual(await f.read(), invoice);
  assert.deepEqual(f.student().activeUntil, student.activeUntil);
  assert.deepEqual(f.receipts(), receipt);
});

test("a fully discounted paid invoice produces a zero-value receipt with verified coverage", async () => {
  const f = await makeStripeWebhookFixture(); f.state.invoice.amount_due = 0;
  f.pay(); await f.process(f.event("invoice.paid"));
  assert.equal(f.receipts()[0][1].amountPaid, 0);
  assert.deepEqual(f.student().activeUntil, END);
});
