const {test} = require("node:test");
const assert = require("node:assert/strict");
const {fixture} = require("./test_support/renewal_episode_fixture");
const {studentSubscriptionAccess} = require("../syllabus_subscription/domain/student_subscription_access");
test("first failed renewal fully pauses Stripe and starts a fixed grace period", async () => {
  const f = fixture(); await f.initialize();
  const e = await f.episode();
  assert.equal(f.subscription.status, "paused"); assert.equal(f.collectionDisabled, true);
  assert.equal(e.attemptsMade, 0); assert.equal(+e.graceUntil, +f.now + 72 * 3600000);
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
});
test("a missing failure webhook is recovered from live Stripe without charging on page load", async () => {
  const f = fixture(); f.moveHours(24);
  const details = await f.details();
  assert.equal(details.renewalRecovery.version, 2); assert.equal(f.subscription.status, "paused");
  assert.equal(f.payCount, 0); assert.equal(f.invoices.size, 0);
  assert.equal(+(await f.episode()).firstFailedAt, +f.context.invoiceCreatedAt);
  await f.command(); assert.equal(f.context.invoiceStatus, "void"); assert.equal(f.payCount, 1);
});
test("old unpaid invoices are not enrolled by a guardian lookup", async () => {
  const f = fixture(); f.context.invoiceCreatedAt = new Date("2026-10-01");
  assert.equal(await f.details(), null); assert.equal(f.operations.length, 0);
});
test("view repair cannot replay an interrupted payment or confirm an unfinished attempt", async () => {
  const f = fixture(); await f.initialize(); f.failOperation = "createPayment";
  await assert.rejects(f.command());
  assert.ok((await f.episode()).attempt);
  f.failOperation = null; f.operations.length = 0;
  await f.controller.handleStripeEvent({...f.event(), observationOnly: true});
  await f.controller.run(await f.episode(), {action: "observe"});
  assert.equal(f.payCount, 0);
  assert.deepEqual(f.operations, []);
});
test("manual retry replaces the old invoice and starts a full paid month on success", async () => {
  const f = fixture(); await f.initialize(); f.moveHours(36);
  const details = await f.command(), e = await f.episode();
  assert.equal(f.context.invoiceStatus, "void"); assert.equal(details.paymentState, "paid");
  assert.equal(e.completedInvoiceReference, e.attempt.invoiceReference); assert.notEqual(e.completedInvoiceReference, "in_original");
  assert.equal(+e.paidAt, +f.now); assert.equal(e.paidThrough.toISOString(), "2026-12-02T12:00:00.000Z");
  assert.equal(f.student().applicationStatus, "active"); assert.equal(f.payCount, 1); assert.equal(e.attemptsMade, 0);
  assert.equal(f.invoices.get(e.completedInvoiceReference).start.toISOString(), f.now.toISOString());
});
test("grace expiry voids the old invoice and a later manual payment covers only a new period", async () => {
  const f = fixture(); await f.initialize(); f.moveHours(96); await f.controller.execute();
  assert.equal(f.student().applicationStatus, "suspended"); assert.equal(f.context.invoiceStatus, "void");
  f.moveHours(24 * 30); const result = await f.command();
  assert.equal(result.paymentState, "paid"); assert.equal(f.payCount, 1);
  assert.equal((await f.episode()).paidAt.toISOString(), f.now.toISOString());
});
test("replaced invoices preserve grace and automatic retry allowance", async () => {
  const f = fixture(); f.outcomes = Array(3).fill("requires_payment_method"); await f.initialize();
  const grace = +(await f.episode()).graceUntil;
  for (let i = 1; i <= 3; i++) {f.moveHours(12); await f.controller.execute(); assert.equal((await f.episode()).attemptsMade, i);}
  const e = await f.episode(); assert.equal(+e.graceUntil, grace); assert.equal(e.nextRetryAt, null);
  assert.equal(f.student().applicationStatus, "active"); assert.equal(f.invoices.size, 3);
  assert.ok([...f.invoices.values()].every(i => i.status === "void"));
  f.moveHours(36); await f.controller.execute(); assert.equal(f.student().applicationStatus, "suspended"); assert.equal(f.payCount, 3);
});
test("manual failures do not consume automatic retries or reset their schedule", async () => {
  const f = fixture(); await f.initialize(); const e = await f.episode(); f.moveHours(1); f.outcomes = ["requires_payment_method"];
  await f.command(); const after = await f.episode();
  assert.equal(after.attemptsMade, 0); assert.equal(+after.graceUntil, +e.graceUntil); assert.equal(+after.nextRetryAt, +e.nextRetryAt);
});
test("guardian can pay for a newly selected plan on the same subscription", async () => {
  const f = fixture(); await f.initialize(); const result = await f.command(f.planInput()); const e = await f.episode();
  assert.equal(result.subscriptionReference, "sub_one"); assert.equal(result.planId, "annual"); assert.equal(e.attempt.terms.amount, 24000);
  assert.equal(e.paidThrough.toISOString(), "2027-11-01T00:00:00.000Z"); assert.equal(f.subscription.currentPriceReference, "price_annual");
});
test("a recovered plan can be read back through the real registration repository and model", async () => {
  const {FirestoreStripeCustomerRepository} = require("../stripe_customer/infrastructure/firestore_stripe_customer_repository");
  const {ManageStripeCustomerRecords} = require("../stripe_customer/application/manage_stripe_customer_records");
  const {FirestoreSubscriptionPlanChangeRepository} = require("../stripe_customer/infrastructure/firestore_subscription_plan_change_repository");
  const f = fixture(), registry = new FirestoreStripeCustomerRepository(f.memory.dependencies);
  const records = new ManageStripeCustomerRecords({stripeCustomerRepository: registry, now: () => new Date("2026-10-01")});
  await records.createCustomerRecord({mode: "test", customerReference: "cus_one", internalReference: "guardian"});
  await records.writeSubscriptionRecord({...f.record, paymentMethodReference: "pm_saved", status: "active",
    subscriptionStartDate: new Date("2026-10-01"), cancelAtPeriodEnd: false});
  const changes = new FirestoreSubscriptionPlanChangeRepository({...f.memory.dependencies, now: () => f.now});
  f.dependencies.getSubscriptionRecord = input => records.getSubscriptionRecord(input);
  f.dependencies.applyRecoveredPlan = input => changes.applyRecoveredPlan(input);
  await f.initialize(); await f.command(f.planInput());
  const details = await f.details();
  assert.equal(details.paymentState, "paid"); assert.equal(details.planId, "annual");
  const stored = await records.getSubscriptionRecord({mode: "test", customerReference: "cus_one", subscriptionReference: "sub_one"});
  assert.equal(stored.pendingPlanChange, null); assert.equal(stored.planVersions.length, 2);
});
test("a stale quote and a currency change cannot start a payment", async () => {
  const f = fixture(); await f.initialize();
  await assert.rejects(() => f.command({...f.planInput(), quoteReference: "stale"}), /price changed/);
  f.annual.currency = "usd"; await assert.rejects(() => f.command(f.planInput()), /cannot be used/);
  assert.equal(f.payCount, 0);
});
test("manual new-card payment retains its attempt while 3DS is in progress", async () => {
  const f = fixture(); await f.initialize(); const prepared = await f.command({action: "new_card"});
  assert.equal(prepared.renewal.action, "enter_new_card"); assert.ok(prepared.renewal.paymentClientSecret);
  let e = await f.episode(); const pi = f.payments.get(e.attempt.paymentIntentReference); pi.status = "requires_action";
  assert.equal((await f.details()).renewal.action, "confirm_payment");
  await f.command({idempotencyReference: "another-request"}); assert.equal(f.invoices.size, 1);
  f.moveHours(96); await f.controller.execute(); assert.equal(f.student().applicationStatus, "suspended");
  pi.status = "succeeded"; pi.paidAt = f.now; pi.paymentMethodReference = "pm_new";
  const result = await f.details(); e = await f.episode();
  assert.equal(result.paymentState, "paid"); assert.equal(+e.paidAt, +f.now);
  assert.equal(result.subscriptionStatus, "trialing"); assert.equal(result.nextChargeAt, e.paidThrough.toISOString());
  assert.equal(e.paidThrough.toISOString(), "2026-12-05T00:00:00.000Z");
});
test("automatic authentication failure closes the attempt and requests manual payment", async () => {
  const f = fixture(); await f.initialize(); f.outcomes = ["requires_action"]; f.moveHours(12); await f.controller.execute();
  const e = await f.episode(), result = await f.details();
  assert.equal(e.automaticStoppedReason, "authentication_required"); assert.equal(e.attempt.state, "failed");
  assert.equal(e.nextRetryAt, null); assert.equal(result.renewal.action, "retry_payment"); assert.equal(result.recoveryPending, false);
  assert.equal(f.invoices.get(e.attempt.invoiceReference).status, "void"); assert.equal(f.payCount, 1);
});
test("initial automatic authentication-required webhook starts grace without waiting for a session", async () => {
  const f = fixture(); f.context.paymentStatus = "requires_action"; f.context.failureCode = "authentication_required";
  await f.controller.handleStripeEvent(f.event("invoice.payment_action_required"));
  assert.equal((await f.episode()).nextRetryAt, null); assert.equal(f.context.invoiceStatus, "void");
  assert.equal((await f.details()).renewal.action, "retry_payment");
});
test("permanent card failure stops automatic retries until guardian pays manually", async () => {
  const f = fixture(); f.context.failureCode = "stolen_card"; await f.initialize();
  let result = await f.details(); assert.equal(result.renewal.canRetry, false); assert.equal(result.renewal.canPayWithNewCard, true);
  await assert.rejects(() => f.command(), /Use a new card/);
  f.moveHours(12); await f.controller.execute(); assert.equal(f.payCount, 0);
  f.subscription.defaultPaymentMethodReference = "pm_replaced"; result = await f.details(); assert.equal(result.renewal.canRetry, true);
});
test("cancelling an interrupted unconfirmed payment never confirms or charges it", async () => {
  const f = fixture(); await f.initialize(); f.failOperation = "confirm";
  await assert.rejects(() => f.command()); assert.equal(f.payCount, 0);
  f.failOperation = null; const result = await f.command({action: "cancel_payment"});
  assert.equal(result.recoveryPending, false); assert.equal(f.payCount, 0);
});
test("pending recovery blocks card changes and verified completion unlocks them", async () => {
  const f = fixture(); await f.initialize();
  const input = {studentId: "student", mode: "test", subscriptionReference: "sub_one"};
  assert.equal(await f.controller.cardChangeAllowed(input), true);
  await f.command({action: "new_card"}); assert.equal(await f.controller.cardChangeAllowed(input), false);
  await f.command({action: "cancel_payment"}); assert.equal(await f.controller.cardChangeAllowed(input), true);
});
test("billing review still persists access suspension at the original grace deadline", async () => {
  const f = fixture(); await f.initialize();
  await f.repo.mutate(await f.episode(), e => {e.state = "manual_review"; e.nextRetryAt = null; return e;});
  f.moveHours(72); await f.controller.execute(); assert.equal(f.student().applicationStatus, "suspended");
  assert.equal((await f.episode()).state, "manual_review"); assert.equal(f.payCount, 0);
});
test("a newer paid subscription cannot be replaced by another subscription's recovery", async () => {
  const f = fixture(); f.memory.put("subscriptions/student", {...f.student(), paymentSubscriptionReference: "sub_newer"});
  await assert.rejects(() => f.initialize(), /different subscription/); assert.equal(f.payCount, 0);
});
test("lost payment response is reconciled without a second charge", async () => {
  const f = fixture(); await f.initialize(); f.loseConfirmResponse = true;
  await assert.rejects(() => f.command(), /Lost response/);
  const result = await f.details(); assert.equal(result.paymentState, "paid"); assert.equal(f.payCount, 1);
});
test("duplicate clicks and competing requests cannot create duplicate charges", async () => {
  const f = fixture(); await f.initialize();
  await Promise.all([f.command(), f.command({idempotencyReference: "second"}), f.command()]);
  assert.equal(f.payCount, 1); assert.equal(f.invoices.size, 1);
});
test("replaying a finished failed request does not make a fresh payment", async () => {
  const f = fixture(); await f.initialize(); f.outcomes = ["requires_payment_method"];
  await f.command(); await f.command(); assert.equal(f.payCount, 1); assert.equal(f.invoices.size, 1);
  await f.command({idempotencyReference: "next"}); assert.equal(f.payCount, 2);
});
test("pending processing cannot be cancelled or replaced prematurely", async () => {
  const f = fixture(); await f.initialize(); f.outcomes = ["processing"]; await f.command();
  const result = await f.command({action: "cancel_payment"});
  assert.equal(result.recoveryPending, true); await f.command({idempotencyReference: "second"}); assert.equal(f.payCount, 1);
});
test("abandoned manual approval can be safely cancelled before a new attempt", async () => {
  const f = fixture(); await f.initialize(); f.outcomes = ["requires_action"]; await f.command();
  const result = await f.command({action: "cancel_payment"}); assert.equal(result.recoveryPending, false);
  assert.equal((await f.episode()).attempt.state, "cancelled");
  await f.command({idempotencyReference: "next"}); assert.equal(f.payCount, 2);
});
test("cancellation during grace voids debt, stops retries, and preserves access until deadline", async () => {
  const f = fixture(); await f.initialize(); f.moveHours(10);
  const grace = +(await f.episode()).graceUntil, result = await f.command({action: "cancel_renewal"});
  assert.equal(result.renewalCancelled, true); assert.equal(f.context.invoiceStatus, "void"); assert.equal(f.student().applicationStatus, "active");
  f.moveHours(62); await f.controller.execute(); assert.equal(f.student().applicationStatus, "suspended"); assert.equal(+(await f.episode()).graceUntil, grace);
});
test("a successful payment racing cancellation is settled rather than replaced", async () => {
  const f = fixture(); await f.initialize(); await f.command({action: "new_card"});
  const e = await f.episode(), pi = f.payments.get(e.attempt.paymentIntentReference);
  Object.assign(pi, {status: "succeeded", paidAt: f.now, paymentMethodReference: "pm_new"});
  const result = await f.command({action: "cancel_payment"}); assert.equal(result.paymentState, "paid");
  assert.equal(f.invoices.get(e.attempt.invoiceReference).status, "paid");
});
test("old Stripe notifications cannot suspend a recovered subscription", async () => {
  const f = fixture(); await f.initialize(); await f.command(); f.moveHours(1); await f.initialize();
  assert.equal(f.student().applicationStatus, "active"); assert.equal((await f.episode()).state, "completed");
});
test("legacy debt and initial payment failures are excluded from new recovery", async () => {
  const f = fixture(); f.context.invoiceCreatedAt = new Date("2026-10-01");
  assert.equal((await f.initialize()).legacyExcluded, true); assert.equal(f.operations.length, 0);
  const g = fixture(); g.context.billingReason = "subscription_create";
  assert.equal((await g.initialize()).handled, false); assert.equal(g.operations.length, 0);
});
test("ownership, student links and invoice references are checked before charging", async () => {
  const f = fixture(); await f.initialize();
  await assert.rejects(() => f.command({internalReference: "other"}), e => e.code === "not-found");
  await assert.rejects(() => f.command({invoiceReference: "in_sibling"}), e => e.code === "not-found");
  f.unlinked = true; await assert.rejects(() => f.command(), e => e.code === "permission-denied"); assert.equal(f.payCount, 0);
});
