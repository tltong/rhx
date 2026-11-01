const assert = require("node:assert/strict");
const {test} = require("node:test");
const {makeStripeWebhookFixture, NOW, END} = require("./test_support/stripe_webhook_fixture");
const later = () => new Date(NOW.getTime() + 60000);
const technical = f => f.records.getSubscriptionRecord({mode: f.mode, customerReference: "cus_one", subscriptionReference: "sub_one"});

test("retry before payment preserves invoice state and returns the current payment secret", async () => {
  const f = await makeStripeWebhookFixture({registered: false});
  const first = await f.checkout();
  assert.equal(first.paymentClientSecret, "pi_one_secret_private");
  const original = await f.read();
  f.now = later(); f.state.invoice.confirmation_secret.client_secret = "pi_one_secret_current";
  const replay = await f.checkout();
  assert.equal(replay.paymentClientSecret, "pi_one_secret_current");
  assert.deepEqual(await f.read(), original);
  assert.deepEqual(f.state.createRequests[0], f.state.createRequests[1]);
});

test("paid checkout replays preserve canonical invoice, receipt, access and original identity in both modes", async () => {
  for (const mode of ["test", "prod"]) {
    const f = await makeStripeWebhookFixture({mode, registered: false});
    await f.checkout(); f.pay(); await f.process(f.event("invoice.paid"));
    const invoice = await f.read(), parent = f.student(), receipts = f.receipts(), identity = await technical(f);
    f.now = later();
    assert.deepEqual(await f.checkout(), {subscriptionReference: "sub_one", status: "active", paymentClientSecret: null});
    assert.deepEqual(await f.read(), invoice);
    assert.deepEqual(f.student(), parent);
    assert.deepEqual(f.receipts(), receipts);
    assert.deepEqual(await technical(f), identity);
    assert.deepEqual(parent.activeUntil, END);
  }
});

test("authentication-required invoice state is not reset by checkout replay", async () => {
  const f = await makeStripeWebhookFixture({registered: false}); await f.checkout();
  f.state.intent.status = "requires_action"; f.state.invoice.attempted = true;
  await f.process(f.event("invoice.payment_action_required"));
  const invoice = await f.read();
  f.now = later(); await f.checkout();
  assert.deepEqual(await f.read(), invoice);
  assert.equal(invoice.paymentState, "authentication_required");
});

test("concurrent first checkout requests initialize one identity and one invoice", async () => {
  const f = await makeStripeWebhookFixture({registered: false});
  await Promise.all([f.checkout(), f.checkout()]);
  assert.equal([...f.memory.store.keys()].filter(k => k.includes("/invoices/")).length, 1);
  assert.equal(f.receipts().length, 0);
  assert.equal((await technical(f)).studentId, "student-a");
});

test("a paid webhook committing during invoice initialization wins and suppresses stale checkout confirmation", async () => {
  const f = await makeStripeWebhookFixture({registered: false}); await f.checkout();
  f.memory.beforeCommit = async () => {
    if (f.state.requests.at(-1)?.[0] !== "invoice") return;
    f.memory.beforeCommit = null;
    f.pay(); await f.process(f.event("invoice.paid"));
  };
  const result = await f.checkout();
  assert.equal(result.status, "active");
  assert.equal(result.paymentClientSecret, null);
  assert.equal((await f.read()).paymentState, "paid");
  assert.equal(f.receipts().length, 1);
});

test("a webhook preceding registration remains retryable and grants access after checkout registration", async () => {
  const f = await makeStripeWebhookFixture({registered: false}); f.pay();
  const event = f.event("invoice.paid");
  assert.equal((await f.deliver(event)).statusCode, 500);
  await f.checkout();
  assert.equal((await f.deliver(event)).statusCode, 200);
  assert.deepEqual(f.student().activeUntil, END);
  assert.equal(f.receipts().length, 1);
});

test("a checkout cannot be reassigned to another student, plan or immutable billing terms", async () => {
  for (const [key, value] of [["studentId", "student-b"], ["planId", "other"], ["paymentMethodReference", "pm_other"],
    ["amount", 999], ["currency", "usd"], ["intervalCount", 3]]) {
    const f = await makeStripeWebhookFixture({registered: false}); await f.checkout();
    f.pay(); await f.process(f.event("invoice.paid"));
    const before = await f.read();
    f.memory.put("subscriptions/student-b", {subscriptionType: "trial"});
    const changes = {};
    if (["amount", "currency", "intervalCount"].includes(key)) f.billingTerms[key] = value;
    else changes[key] = value;
    await assert.rejects(() => f.checkout(changes), e => e.code === "failed-precondition");
    assert.deepEqual(await f.read(), before);
    assert.equal(f.receipts().length, 1);
  }
});

test("concurrent conflicting students cannot replace the winning checkout binding", async () => {
  const f = await makeStripeWebhookFixture({registered: false});
  f.memory.put("subscriptions/student-b", {subscriptionType: "trial"});
  const results = await Promise.allSettled([f.checkout(), f.checkout({studentId: "student-b"})]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal([...f.memory.store.keys()].filter(k => k.includes("/invoices/")).length, 1);
});

test("Stripe retrieval failures and mismatched identities leave paid billing records intact", async () => {
  const f = await makeStripeWebhookFixture({registered: false}); await f.checkout(); f.pay();
  await f.process(f.event("invoice.paid")); const before = await f.read();
  f.state.retrievalError = Error("network"); await assert.rejects(() => f.checkout());
  f.state.retrievalError = null; f.state.subscription.customer = "cus_other";
  await assert.rejects(() => f.checkout());
  assert.deepEqual(await f.read(), before);
});

test("a customer deleted before checkout registration cannot leave an orphan invoice", async () => {
  const f = await makeStripeWebhookFixture({registered: false});
  const create = f.stripe.stripeClient.subscriptions.create;
  f.stripe.stripeClient.subscriptions.create = async (...args) => {
    const value = await create(...args); f.memory.remove(`stripeCustomers/${f.mode}/customers/cus_one`); return value;
  };
  await assert.rejects(() => f.checkout());
  assert.equal([...f.memory.store.keys()].some(k => k.includes("/invoices/")), false);
});

test("a replay after Stripe creation but before local registration uses the paid live state", async () => {
  const f = await makeStripeWebhookFixture({registered: false});
  f.memory.beforeCommit = () => {f.memory.beforeCommit = null; throw Error("temporary database outage");};
  await assert.rejects(() => f.checkout()); f.pay();
  const result = await f.checkout();
  assert.equal(result.status, "active"); assert.equal(result.paymentClientSecret, null);
  assert.equal((await f.read()).paymentState, "paid");
  assert.equal(f.receipts().length, 1);
});

test("a failed initial live lookup leaves the registration usable for webhook recovery", async () => {
  const f = await makeStripeWebhookFixture({registered: false}); f.state.retrievalError = Error("network");
  await assert.rejects(() => f.checkout());
  assert.ok(await technical(f));
  f.state.retrievalError = null; f.pay(); await f.process(f.event("invoice.paid"));
  await f.checkout();
  assert.equal((await f.read()).paymentState, "paid");
  assert.equal(f.receipts().length, 1);
});
