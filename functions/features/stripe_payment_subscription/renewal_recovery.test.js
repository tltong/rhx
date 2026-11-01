const assert = require("node:assert/strict");
const {test} = require("node:test");
const {makeRecoveryFixture} = require("./test_support/renewal_recovery_fixture");
const {studentSubscriptionAccess} = require("../syllabus_subscription/domain/student_subscription_access");
const {addBillingMonths} = require("../syllabus_subscription/domain/renewal_recovery");

test("first failed renewal freezes one payable invoice and grants access only until the fixed grace deadline", async () => {
  const f = await makeRecoveryFixture(); await f.seed();
  assert.equal((await f.recovery()).state, "held");
  assert.equal(f.state.invoice.auto_advance, false);
  assert.deepEqual(f.state.subscription.pause_collection, {behavior: "keep_as_draft"});
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
  f.advance(6);
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, false, "A late worker cannot extend access");
  assert.equal((await f.manager.getDetails({internalReference: "guardian-a", subscriptionReference: f.scope.paymentSubscriptionReference})).applicationStatus, "suspended");
  await f.controller.execute();
  assert.equal(f.student().applicationStatus, "suspended");
  assert.equal((await f.recovery()).state, "suspended");
});

test("recovery during grace starts a full paid period from the payment timestamp without a second charge", async () => {
  for (const mode of ["test", "prod"]) {
    const f = await makeRecoveryFixture({mode}); await f.seed(); f.advance(2); f.state.behavior = "paid";
    const paidAt = new Date(f.now); const result = await f.worker.execute();
    assert.equal(result.paid, 1);
    assert.equal((await f.recovery()).state, "completed");
    assert.equal(f.student().activeUntil.toISOString(), "2026-12-01T02:00:00.000Z");
    assert.equal(f.student().renewalRecovery.paidAt.getTime(), paidAt.getTime());
    assert.equal(f.student().applicationStatus, "active");
    assert.equal(f.state.actualAttempts, 1);
    assert.equal(f.state.subscription.pause_collection, null);
    const reset = f.subscriptionUpdates.find(c => c.params.trial_end);
    assert.equal(reset.params.proration_behavior, "none");
    assert.equal(reset.params.billing_cycle_anchor, undefined);
  }
});

test("payment after suspension restores only that student's access and uses the actual paid date", async () => {
  const f = await makeRecoveryFixture(); await f.seed(); f.advance(6); await f.controller.execute();
  f.now = new Date("2026-11-12T09:30:00Z"); f.pay(); await f.process(f.event("invoice.paid"));
  assert.equal(f.student().applicationStatus, "active");
  assert.equal(f.student().activeUntil.toISOString(), "2026-12-12T09:30:00.000Z");
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
  assert.equal(f.state.paymentCalls.length, 0, "A received external payment must not be charged again");
});

test("new draft cycles never replace the recovery invoice and are removed before billing resumes", async () => {
  const f = await makeRecoveryFixture(); await f.seed();
  f.now = new Date("2027-01-31T10:00:00Z"); f.addDraft("in_draft_dec"); f.addDraft("in_draft_jan");
  const details = await f.manager.getDetails({internalReference: "guardian-a", subscriptionReference: f.scope.paymentSubscriptionReference});
  assert.equal(details.renewal.invoiceReference, "in_renewal");
  assert.equal(details.renewal.canRetry, true);
  f.makeBridge = true; f.pay(); await f.process(f.event("invoice.paid"));
  assert.deepEqual(f.deletedDrafts.sort(), ["in_draft_dec", "in_draft_jan"]);
  assert.equal(f.student().activeUntil.toISOString(), "2027-02-28T10:00:00.000Z");
  const paid = await f.manager.getDetails({internalReference: "guardian-a", subscriptionReference: f.scope.paymentSubscriptionReference});
  assert.equal(paid.renewal.invoiceReference, "in_renewal", "A zero-charge bridge invoice is not the renewal being recovered");
  const invoice = await f.read("in_renewal");
  assert.equal(invoice.billingPeriodStart.toISOString(), "2026-11-01T00:00:00.000Z", "Original Stripe invoice facts stay intact");
  assert.equal(invoice.recoveredCoverageStart.toISOString(), "2027-01-31T10:00:00.000Z");
});

test("billing reset failures survive webhook acknowledgement failure and background reconciliation retains the paid timestamp", async () => {
  const f = await makeRecoveryFixture(); await f.seed(); f.advance(6); await f.controller.execute();
  f.pay(); const paidAt = new Date(f.now); f.failRestart = true;
  assert.equal((await f.deliver(f.event("invoice.paid"))).statusCode, 500);
  assert.equal(f.student().applicationStatus, "suspended");
  assert.equal((await f.recovery()).state, "pending_reset");
  f.failRestart = false; f.advance(1 / 12); await f.controller.execute();
  assert.equal((await f.recovery()).state, "completed");
  assert.equal(f.student().renewalRecovery.paidAt.getTime(), paidAt.getTime());
  assert.equal(f.student().activeUntil.getTime(), addBillingMonths(paidAt, 1).getTime());
  assert.equal(f.state.paymentCalls.length, 0);
});

test("a lost billing-reset response is reconciled without issuing the reset or charging again", async () => {
  const f = await makeRecoveryFixture(); await f.seed(); f.pay(); f.loseRestartResponse = true;
  await f.deliver(f.event("invoice.paid")); f.advance(1 / 12); await f.controller.execute();
  assert.equal((await f.recovery()).state, "completed");
  assert.equal(f.subscriptionUpdates.filter(c => c.params.trial_end).length, 1);
  assert.equal(f.state.paymentCalls.length, 0);
});

test("other finalized unpaid invoices or custom draft items require review instead of being silently cleared", async () => {
  for (const kind of ["unpaid", "custom-draft"]) {
    const f = await makeRecoveryFixture(); await f.seed();
    if (kind === "unpaid") f.otherOpen.push({...f.state.invoice, id: "in_older", amount_remaining: 2500});
    else {const draft = f.addDraft(); draft.lines.data.push({type: "invoiceitem", amount: 500});}
    f.pay(); await f.process(f.event("invoice.paid"));
    assert.equal((await f.recovery()).state, "manual_review");
    assert.equal(f.subscriptionUpdates.some(c => c.params.trial_end), false);
    assert.equal(f.deletedDrafts.length, 0);
  }
});


test("exhausting automatic attempts does not shorten a longer suspension grace period", async () => {
  const f = await makeRecoveryFixture({maxRetries: 1, intervalHours: 1, gracePeriodHours: 6}); await f.seed();
  f.advance(1); await f.worker.execute();
  assert.equal((await f.plan()).state, "awaiting_action");
  assert.equal(f.student().applicationStatus, "active");
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
  f.advance(5); assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, false);
});

test("zero retries still grants the explicit grace period and retries scheduled beyond grace are omitted", async () => {
  for (const options of [{maxRetries: 0}, {maxRetries: 3, intervalHours: 24}]) {
    const f = await makeRecoveryFixture({...options, gracePeriodHours: 6}); await f.seed();
    assert.equal((await f.plan()).state, "awaiting_action");
    assert.equal((await f.plan()).nextAttemptAt, null);
    assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
    f.advance(6); await f.worker.execute();
    assert.equal(f.state.paymentCalls.length, 0);
    assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, false);
  }
});

test("a final attempt scheduled at the grace boundary can run on the next sweep while access remains suspended", async () => {
  const f = await makeRecoveryFixture({maxRetries: 1, intervalHours: 1, gracePeriodHours: 1}); await f.seed();
  f.advance(1 + 4 / 60);
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, false);
  f.state.behavior = "paid"; await f.worker.execute();
  assert.equal(f.state.actualAttempts, 1);
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
});

test("concurrent recovery sweeps and duplicate paid webhooks do not create extra resets or receipts", async () => {
  const f = await makeRecoveryFixture(); await f.seed(); f.pay();
  const event = f.event("invoice.paid");
  await Promise.all([f.process(event), f.process(event), f.controller.execute()]);
  await f.controller.execute();
  assert.equal((await f.recovery()).state, "completed");
  assert.equal(f.subscriptionUpdates.filter(c => c.params.trial_end).length, 1);
  const receipts = [...f.memory.store.keys()].filter(path => path.startsWith("subscriptions/student-a/payments/"));
  assert.equal(receipts.length, 2, "One initial receipt and one recovery receipt");
});


test("older retry plans are upgraded without extending their original grace period", async () => {
  const f = await makeRecoveryFixture({gracePeriodHours: 12});
  const reconcile = f.processor.reconcileRenewalRecovery; f.processor.reconcileRenewalRecovery = null;
  await f.seed(); assert.equal(await f.recovery(), undefined);
  const previousGrace = (await f.plan()).graceUntil;
  f.processor.reconcileRenewalRecovery = reconcile;
  f.advance(1); f.pay();
  const details = await f.manager.getDetails({internalReference: "guardian-a", subscriptionReference: f.scope.paymentSubscriptionReference});
  assert.equal((await f.recovery()).state, "completed");
  assert.equal((await f.recovery()).graceUntil.getTime(), previousGrace.getTime());
  assert.equal(details.renewalRecovery.state, "completed");
  assert.equal(f.student().activeUntil.toISOString(), "2026-12-01T01:00:00.000Z");
});

test("a paid webhook delivered before the failure webhook still adopts the actual successful payment date", async () => {
  const f = await makeRecoveryFixture(); const failed = f.event("invoice.payment_failed");
  f.advance(2); f.pay(); await f.process(f.event("invoice.paid"));
  await f.process(failed);
  assert.equal((await f.recovery()).state, "completed");
  assert.equal(f.student().activeUntil.toISOString(), "2026-12-01T02:00:00.000Z");
  assert.equal(f.state.paymentCalls.length, 0);
});

test("one student's billing transitions do not suspend or modify a sibling's paid subscription", async () => {
  const f = await makeRecoveryFixture();
  const sibling = {subscriptionType: "ongoing", paymentProvider: "stripe", paymentMode: "prod",
    paymentSubscriptionReference: "sub_sibling", activeUntil: new Date("2026-12-01Z"), applicationStatus: "active"};
  f.memory.put("subscriptions/student-b", sibling);
  await f.seed(); f.advance(6); await f.controller.execute();
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, false);
  assert.equal(studentSubscriptionAccess(f.memory.store.get("subscriptions/student-b"), f.now).allowed, true);
  f.pay(); await f.process(f.event("invoice.paid"));
  assert.deepEqual(f.memory.store.get("subscriptions/student-b"), sibling);
});


test("a missed failure webhook is recovered from verified live billing state without a second initial attempt", async () => {
  const f = await makeRecoveryFixture();
  const config = f.processor.getPaymentConfig; f.processor.getPaymentConfig = null;
  await f.seed(); assert.equal(await f.plan(), undefined);
  f.processor.getPaymentConfig = config;
  const details = await f.manager.getDetails({internalReference: "guardian-a", subscriptionReference: f.scope.paymentSubscriptionReference});
  assert.equal(details.renewalRecovery.state, "held");
  assert.equal(f.state.invoice.auto_advance, false);
  assert.equal(f.state.paymentCalls.length, 0);
  assert.equal((await f.plan()).attemptsMade, 0);
});

test("pending customer charges are preserved for review and sibling-specific charges do not block recovery", async () => {
  for (const scope of [null, "same", "sibling"]) {
    const f = await makeRecoveryFixture(); await f.seed();
    f.pendingItems.push({id: "ii_pending", subscription: scope === "same" ? f.scope.paymentSubscriptionReference : scope === "sibling" ? "sub_sibling" : null});
    f.pay(); await f.process(f.event("invoice.paid"));
    assert.equal((await f.recovery()).state, scope === "sibling" ? "completed" : "manual_review");
    assert.equal(f.state.paymentCalls.length, 0);
    assert.equal(f.pendingItems.length, 1);
  }
});
