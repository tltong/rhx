const assert = require("node:assert/strict");
const {test} = require("node:test");
const {makeRenewalRetryFixture} = require("./test_support/renewal_retry_fixture");
const {ProcessDueRenewalRetries} = require("./application/process_due_renewal_retries");
const {retryStripeRenewals} = require("../../stripe_renewal_retry_scheduler");

test("signed renewal failure snapshots payment policy, disables Stripe retries, and ignores duplicate deliveries", async () => {
  for (const mode of ["test", "prod"]) {
    const f = await makeRenewalRetryFixture({mode});
    const event = f.event("invoice.payment_failed");
    assert.equal((await f.deliver(event)).statusCode, 200);
    const plan = await f.plan();
    assert.equal(plan.state, "scheduled"); assert.equal(plan.attemptsMade, 0);
    assert.equal(plan.nextAttemptAt.getTime(), f.now.getTime() + 3600000);
    assert.equal(f.student().applicationStatus, "active");
    assert.equal(f.state.invoice.auto_advance, false);
    f.policy = {maxRetries: 8, intervalHours: 5};
    await f.deliver(event); await f.process(f.event("invoice.payment_failed"));
    assert.deepEqual(await f.plan(), plan);
    assert.equal(f.state.paymentCalls.length, 0);
  }
});

test("three spaced backend retries suspend only the application status after the final failure", async () => {
  const f = await makeRenewalRetryFixture(); await f.seed();
  assert.equal((await f.worker.execute()).examined, 0);
  for (let attempt = 1; attempt <= 3; attempt++) {
    f.advance(1);
    const result = await f.worker.execute();
    assert.equal(result.attempted, 1);
    assert.equal(f.state.actualAttempts, attempt);
    assert.equal((await f.plan()).attemptsMade, attempt);
    assert.equal(f.student().applicationStatus, attempt === 3 ? "suspended" : "active");
    assert.deepEqual(f.student().activeUntil, f.paidThrough);
    assert.equal(f.student().subscriptionType, "ongoing");
    assert.equal(f.receipts().length, 1);
    assert.equal((await f.worker.execute()).examined, 0);
  }
  const details = await f.manager.getDetails({internalReference: "guardian-a", subscriptionReference: "sub_one"});
  assert.equal(details.applicationStatus, "suspended");
  assert.equal(details.renewalRetry.state, "exhausted");
  assert.equal(details.renewal.nextPaymentAttemptAt, null);
  assert.equal(details.renewal.canRetry, true, "Guardian recovery remains available after automatic retries finish");
  for (const call of f.state.paymentCalls) assert.equal(call.input.off_session, true);
});

test("a zero-retry policy suspends on first failure without submitting another payment", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 0}); await f.seed();
  assert.equal(f.student().applicationStatus, "suspended");
  assert.equal((await f.plan()).attemptsMade, 0);
  assert.equal((await f.worker.execute()).examined, 0);
  assert.equal(f.state.paymentCalls.length, 0);
  assert.deepEqual(f.student().activeUntil, f.paidThrough);
});

test("collection-control failure leaves no retry plan or processed failure marker", async () => {
  const f = await makeRenewalRetryFixture(); f.state.controlError = true;
  const event = f.event("invoice.payment_failed");
  assert.equal((await f.deliver(event)).statusCode, 500);
  assert.equal(await f.plan(), undefined);
  f.state.controlError = false;
  assert.equal((await f.deliver(event)).statusCode, 200);
  assert.equal((await f.plan()).state, "scheduled");
});

test("initial payments never start the recurring retry policy", async () => {
  const f = await makeRenewalRetryFixture();
  f.state.invoice.billing_reason = "subscription_create";
  await f.seed();
  assert.equal(await f.plan(), undefined);
  assert.equal(f.state.controlCalls.length, 0);
});

test("concurrent scheduler invocations reserve one payment attempt", async () => {
  const f = await makeRenewalRetryFixture(); await f.seed(); f.advance(1);
  const result = await Promise.all([f.worker.execute(), f.worker.execute()]);
  assert.equal(result.reduce((n, r) => n + r.attempted, 0), 1);
  assert.equal(f.state.actualAttempts, 1);
  assert.equal((await f.plan()).attemptsMade, 1);
});

test("an already-paid invoice reconciles receipt and status without another charge", async () => {
  const f = await makeRenewalRetryFixture(); await f.seed(); f.advance(1); f.pay();
  const result = await f.worker.execute();
  assert.equal(result.paid, 1); assert.equal(f.state.actualAttempts, 0);
  assert.equal((await f.plan()).state, "completed");
  assert.equal(f.receipts().length, 2);
  assert.equal(f.student().applicationStatus, "active");
  assert.equal(f.student().activeUntil.toISOString(), "2026-12-01T00:00:00.000Z");
});

test("verified paid webhook restores a suspended subscription and leaves no future retries", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 1}); await f.seed(); f.advance(1); await f.worker.execute();
  assert.equal(f.student().applicationStatus, "suspended");
  f.pay(); const event = f.event("invoice.paid");
  await f.deliver(event); await f.deliver(event);
  assert.equal(f.student().applicationStatus, "active");
  assert.equal((await f.plan()).state, "completed");
  assert.equal(f.receipts().length, 2);
  assert.equal((await f.worker.execute()).examined, 0);
});

test("lost successful response reconciles payment without charging twice", async () => {
  const f = await makeRenewalRetryFixture(); await f.seed(); f.state.behavior = "lost-response"; f.advance(1);
  const result = await f.worker.execute();
  assert.equal(result.paid, 1); assert.equal(f.state.actualAttempts, 1);
  assert.equal(f.student().applicationStatus, "active");
  assert.equal((await f.plan()).state, "completed");
});

test("unknown request outcome replays the same reservation and key without spending another retry", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 1}); await f.seed(); f.state.behavior = "transport-before-request"; f.advance(1);
  await f.worker.execute();
  assert.equal((await f.plan()).attemptsMade, 1);
  assert.equal((await f.plan()).state, "processing");
  f.advance(5 / 60); await f.worker.execute();
  assert.equal(f.state.paymentCalls.length, 2);
  assert.equal(f.state.paymentCalls[0].options.idempotencyKey, f.state.paymentCalls[1].options.idempotencyKey);
  assert.equal((await f.plan()).attemptsMade, 1);
  assert.equal(f.state.actualAttempts, 1);
  assert.equal((await f.plan()).state, "completed");
});

test("expired worker lease resumes a reserved attempt using its original method and reference", async () => {
  const f = await makeRenewalRetryFixture(); await f.seed(); f.advance(1);
  await f.retries.claimRenewalRetry({...f.retryScope, leaseToken: "crashed-worker"});
  const reserved = await f.retries.beginRenewalRetryAttempt({...f.retryScope, leaseToken: "crashed-worker", paymentMethodReference: "pm_one"});
  f.advance(11 / 60); await f.worker.execute();
  assert.equal((await f.plan()).attemptsMade, 1);
  assert.equal(f.state.actualAttempts, 1);
  assert.ok(reserved.renewalRetry.attemptReference);
});

test("a reservation outside Stripe's idempotency retention window is never replayed", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 1}); await f.seed(); f.advance(1);
  await f.retries.claimRenewalRetry({...f.retryScope, leaseToken: "old-worker"});
  await f.retries.beginRenewalRetryAttempt({...f.retryScope, leaseToken: "old-worker", paymentMethodReference: "pm_one"});
  f.advance(24); await f.worker.execute();
  assert.equal(f.state.paymentCalls.length, 0);
  assert.equal(f.student().applicationStatus, "suspended");
});

test("bank authentication waits for the guardian and ends in suspension if the grace period expires", async () => {
  const f = await makeRenewalRetryFixture(); await f.seed();
  f.state.intent.status = "requires_action";
  await f.process(f.event("invoice.payment_action_required"));
  assert.equal((await f.plan()).state, "awaiting_action");
  f.advance(3); await f.worker.execute();
  assert.equal(f.state.paymentCalls.length, 0);
  assert.equal(f.student().applicationStatus, "suspended");
  const details = await f.manager.getDetails({internalReference: "guardian-a", subscriptionReference: "sub_one"});
  assert.equal(details.renewal.action, "confirm_payment");
});

test("processing payment is reconciled instead of resubmitted or prematurely suspended", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 1}); await f.seed(); f.state.behavior = "processing"; f.advance(1);
  await f.worker.execute(); f.advance(1); await f.worker.execute();
  assert.equal(f.state.actualAttempts, 1);
  assert.equal(f.student().applicationStatus, "active");
  f.pay(); f.advance(5 / 60); await f.worker.execute();
  assert.equal((await f.plan()).state, "completed");
});

test("paid webhook racing a final-failure commit cannot be overwritten by suspension", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 1}); await f.seed(); f.advance(1);
  const realFinish = f.dependencies.finishRenewalRetry;
  const worker = new ProcessDueRenewalRetries({...f.dependencies, finishRenewalRetry: async input => {
    f.memory.beforeCommit = async () => {f.memory.beforeCommit = null; f.pay(); await f.process(f.event("invoice.paid"));};
    return realFinish(input);
  }});
  await worker.execute();
  assert.equal(f.student().applicationStatus, "active");
  assert.equal((await f.plan()).state, "completed");
  assert.equal(f.receipts().length, 2);
});

test("old/test retry plans cannot charge after another production subscription takes over", async () => {
  const f = await makeRenewalRetryFixture({mode: "test"}); await f.seed(); f.advance(1);
  f.memory.put("subscriptions/student-a", {...f.student(), paymentMode: "prod", paymentSubscriptionReference: "sub_new",
    billingSummary: {...f.student().billingSummary, paymentMode: "prod", paymentSubscriptionReference: "sub_new"}});
  await f.worker.execute();
  assert.equal(f.state.paymentCalls.length, 0);
  assert.equal((await f.plan()).state, "stopped");
});

test("only the protected scheduled export drives periodic retries", () => {
  assert.equal(retryStripeRenewals.__endpoint.scheduleTrigger.schedule, "every 5 minutes");
  assert.equal(retryStripeRenewals.__endpoint.maxInstances, 1);
  assert.equal(retryStripeRenewals.__endpoint.httpsTrigger, undefined);
});

test("a failure webhook delivered during the worker's attempt cannot count or reserve another retry", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 1}); await f.seed(); f.advance(1);
  const pay = f.stripe.stripeClient.invoices.pay;
  f.stripe.stripeClient.invoices.pay = async (...args) => {
    try {return await pay(...args);} catch (error) {
      await f.deliver(f.event("invoice.payment_failed"));
      throw error;
    }
  };
  await f.worker.execute();
  assert.equal(f.state.actualAttempts, 1);
  assert.equal((await f.plan()).attemptsMade, 1);
  assert.equal(f.student().applicationStatus, "suspended");
});

test("a new unpaid invoice never clears a prior suspension without verified payment", async () => {
  const f = await makeRenewalRetryFixture({maxRetries: 1}); await f.seed(); f.advance(1); await f.worker.execute();
  assert.equal(f.student().applicationStatus, "suspended");
  f.state.invoice.id = "in_following_month";
  f.state.invoice.created += 30 * 86400;
  f.state.subscription.latest_invoice = f.state.invoice.id;
  f.now = new Date(f.now.getTime() + 30 * 86400000);
  await f.deliver(f.event("invoice.payment_failed"));
  assert.equal(f.student().applicationStatus, "suspended");
});

test("a permanently declined or missing card requests intervention instead of repeated automatic charges", async () => {
  for (const missing of [false, true]) {
    const f = await makeRenewalRetryFixture({maxRetries: 2}); await f.seed();
    if (missing) f.state.subscription.default_payment_method = null;
    else f.state.intent.last_payment_error.decline_code = "expired_card";
    f.advance(1); await f.worker.execute();
    assert.equal(f.state.paymentCalls.length, 0);
    assert.equal((await f.plan()).state, "awaiting_action");
    f.advance(1); await f.worker.execute();
    assert.equal(f.student().applicationStatus, "suspended");
    assert.deepEqual(f.student().activeUntil, f.paidThrough);
  }
});

test("paid webhook between claim and attempt reservation prevents any automatic charge", async () => {
  const f = await makeRenewalRetryFixture(); await f.seed(); f.advance(1);
  const begin = f.dependencies.beginRenewalRetryAttempt;
  const worker = new ProcessDueRenewalRetries({...f.dependencies, beginRenewalRetryAttempt: async input => {
    f.memory.beforeCommit = async () => {f.memory.beforeCommit = null; f.pay(); await f.process(f.event("invoice.paid"));};
    return begin(input);
  }});
  await worker.execute();
  assert.equal(f.state.paymentCalls.length, 0);
  assert.equal((await f.plan()).state, "completed");
  assert.equal(f.student().applicationStatus, "active");
});
