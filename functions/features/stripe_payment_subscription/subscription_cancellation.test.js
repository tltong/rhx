const assert = require("node:assert/strict");
const {test} = require("node:test");
const {fixture} = require("./test_support/guardian_subscription_fixture");
const {fixture: recoveryFixture} = require("./test_support/renewal_episode_fixture");
const {CancelStudentSubscription} = require("./application/cancel_student_subscription");
const {FirestoreSubscriptionCancellationRepository} = require("../syllabus_subscription/infrastructure/firestore_subscription_cancellation_repository");
const {studentSubscriptionAccess} = require("../syllabus_subscription/domain/student_subscription_access");

async function paidFixture() {
  const f = await fixture({registered: true});
  f.pay(); await f.process(f.event("invoice.paid"));
  f.now = new Date("2026-10-10T00:00:00Z"); f.cancelCalls = [];
  f.stripe.stripeClient.subscriptions.cancel = async (id, params) => {
    f.cancelCalls.push({id, params}); f.state.subscription.status = "canceled";
    if (f.lostCancellation) throw Error("Response lost after cancellation");
    return structuredClone(f.state.subscription);
  };
  f.stripe.stripeClient.invoices.voidInvoice = async () => {
    f.state.invoice.status = "void"; f.state.intent.status = "canceled";
    return structuredClone(f.state.invoice);
  };
  f.cancellations = new FirestoreSubscriptionCancellationRepository({...f.memory.dependencies, now: () => f.now});
  f.cancel = new CancelStudentSubscription({...f.dependencies, repository: f.cancellations,
    getSubscriptionRecord: input => f.records.getSubscriptionRecord(input),
    createPaymentProviderForContext: async () => ({paymentProvider: f.stripe}),
    observeFinalInvoice: async () => {if (f.observeFails) throw Error("Read failed"); return f.process(f.event("customer.subscription.deleted"));}});
  f.cancelInput = {internalReference: "guardian-a", subscriptionReference: "sub_one"};
  f.request = () => f.cancellations.get({studentId: "student-a", mode: f.mode, subscriptionReference: "sub_one"});
  return f;
}

test("cancels Stripe immediately without proration, retaining paid access but no additional grace", async () => {
  const f = await paidFixture(), paidUntil = +f.student().activeUntil;
  await f.cancel.command(f.cancelInput);
  assert.equal(f.state.subscription.status, "canceled");
  assert.deepEqual(f.cancelCalls, [{id: "sub_one", params: {invoice_now: false, prorate: false}}]);
  assert.equal((await f.request()).state, "cancelled");
  assert.equal(+f.student().activeUntil, paidUntil);
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
  assert.equal(studentSubscriptionAccess(f.student(), new Date(paidUntil)).allowed, false);
  assert.equal(f.student().renewalGraceUntil, null);
  assert.equal(f.receipts().length, 1);
  assert.equal(f.state.method.customer, "cus_one");
});

test("duplicate clicks and a lost cancellation response reconcile the same subscription", async () => {
  const f = await paidFixture(); f.lostCancellation = true;
  await Promise.all([f.cancel.command(f.cancelInput), f.cancel.command(f.cancelInput)]);
  await f.cancel.command(f.cancelInput);
  assert.equal(f.cancelCalls.length, 1);
  assert.equal((await f.request()).state, "cancelled");
  assert.equal(f.student().subscriptionCancellation.state, "cancelled");
});

test("failed projection remains pending for the protected worker to finish", async () => {
  const f = await paidFixture(); f.observeFails = true;
  await assert.rejects(() => f.cancel.command(f.cancelInput));
  assert.equal(f.state.subscription.status, "canceled");
  assert.equal((await f.request()).state, "pending");
  f.observeFails = false; f.now = new Date(+f.now + 301000);
  assert.equal((await f.cancel.execute({limit: 25})).errors, 0);
  assert.equal((await f.request()).state, "cancelled");
  assert.equal(f.cancelCalls.length, 1);
});

test("a payment already processing blocks replacement until its successful outcome is accounted for", async () => {
  const f = await paidFixture();
  f.state.invoice.status = "open"; f.state.intent.status = "processing";
  await f.cancel.command(f.cancelInput);
  assert.equal((await f.request()).state, "pending");
  assert.equal(f.cancelCalls.length, 0);
  await assert.rejects(() => f.cancel.requirePaymentAllowed(f.cancelInput), {code: "failed-precondition"});
  assert.equal((await f.manager.options(f.base)).canCreate, false);
  f.pay(); await f.cancel.reconcile(f.cancelInput);
  assert.equal((await f.request()).state, "cancelled");
  assert.equal(f.cancelCalls.length, 1);
});

test("an unpaid first invoice is voided before cancelling and a late deleted webhook cannot remove paid coverage", async () => {
  const f = await paidFixture(); f.state.invoice.status = "open"; f.state.intent.status = "requires_action";
  await f.cancel.command(f.cancelInput);
  assert.equal(f.state.invoice.status, "void");
  const until = +f.student().activeUntil;
  await f.process(f.event("customer.subscription.deleted"));
  assert.equal(+f.student().activeUntil, until);
  assert.equal(studentSubscriptionAccess(f.student(), f.now).allowed, true);
});

test("cancellation checks customer ownership and current guardian link before writing or cancelling", async () => {
  const f = await paidFixture();
  await assert.rejects(() => f.cancel.command({...f.cancelInput, internalReference: "other"}), {code: "not-found"});
  f.links = [];
  await assert.rejects(() => f.cancel.command(f.cancelInput), {code: "permission-denied"});
  assert.equal(await f.request(), null);
  assert.equal(f.cancelCalls.length, 0);
});

test("cancelling a scheduled plan cancels its schedule and retains the shared card", async () => {
  const f = await paidFixture(); f.state.subscription.schedule = "sub_sched_one";
  f.stripe.stripeClient.subscriptionSchedules = {
    retrieve: async () => ({id: "sub_sched_one", subscription: "sub_one", customer: "cus_one"}),
    cancel: async (id, params) => {f.scheduleCancellation = {id, params}; f.state.subscription.status = "canceled";}
  };
  await f.cancel.command(f.cancelInput);
  assert.deepEqual(f.scheduleCancellation, {id: "sub_sched_one", params: {invoice_now: false, prorate: false}});
  assert.equal(f.cancelCalls.length, 0);
  assert.equal(f.state.method.customer, "cus_one");
});

test("cancellation during grace stops automatic recovery and preserves its original access deadline", async () => {
  const f = recoveryFixture(); await f.initialize();
  const deadline = +(await f.episode()).graceUntil;
  const repository = new FirestoreSubscriptionCancellationRepository({...f.memory.dependencies, now: () => f.now});
  let calls = 0;
  f.provider.cancelSubscriptionNow = async () => {calls++; f.subscription.status = "canceled"; return {cancelled: true};};
  const cancel = new CancelStudentSubscription({...f.dependencies, repository, episodeRepository: f.repo, recovery: f.controller});
  await cancel.command(f.input());
  assert.equal(calls, 1);
  assert.equal(f.context.invoiceStatus, "void");
  assert.equal((await f.episode()).nextRetryAt, null);
  assert.equal(+f.student().subscriptionCancellation.accessUntil, deadline);
  f.moveHours(100); await f.controller.execute();
  assert.equal(f.payCount, 0);
  assert.equal(studentSubscriptionAccess(f.student(), new Date(deadline)).allowed, false);
});

test("a successful recovery racing cancellation retains its full newly purchased period", async () => {
  const f = recoveryFixture(); await f.initialize(); f.outcomes.push("processing");
  await f.command();
  const repository = new FirestoreSubscriptionCancellationRepository({...f.memory.dependencies, now: () => f.now});
  f.provider.cancelSubscriptionNow = async () => {f.subscription.status = "canceled"; return {cancelled: true};};
  const cancel = new CancelStudentSubscription({...f.dependencies, repository, episodeRepository: f.repo, recovery: f.controller});
  await cancel.command(f.input());
  assert.equal(f.student().subscriptionCancellation.state, "pending");
  const a = (await f.episode()).attempt;
  f.moveHours(1); Object.assign(f.payments.get(a.paymentIntentReference), {status: "succeeded", paidAt: f.now});
  await cancel.reconcile(f.input());
  assert.equal(f.student().subscriptionCancellation.state, "cancelled");
  assert.equal(+f.student().subscriptionCancellation.accessUntil, +f.student().activeUntil);
  assert.equal(f.payCount, 1);
});

test("resubscribing early creates a new Stripe subscription with no immediate charge or receipt", async () => {
  const f = await paidFixture(); await f.cancel.command(f.cancelInput);
  const until = f.student().activeUntil;
  const options = await f.manager.options(f.base);
  assert.equal(options.canCreate, true);
  assert.equal(options.subscriptionReference, null);
  assert.equal(options.firstChargeAt, until.toISOString());
  assert.equal(options.savedCard.paymentMethodReference, "pm_one");
  let createParams;
  f.stripe.stripeClient.subscriptions.create = async input => {
    createParams = input;
    Object.assign(f.state.subscription, {id: "sub_new", status: "trialing", metadata: input.metadata,
      current_period_start: +f.now / 1000, current_period_end: input.trial_end, latest_invoice: "in_bridge"});
    Object.assign(f.state.invoice, {id: "in_bridge", subscription: "sub_new", status: "paid", amount_due: 0,
      amount_paid: 0, amount_remaining: 0, confirmation_secret: null, created: +f.now / 1000,
      status_transitions: {paid_at: +f.now / 1000}, lines: {data: []}});
    return {...structuredClone(f.state.subscription), latest_invoice: structuredClone(f.state.invoice)};
  };
  const input = await f.input();
  const result = await f.manager.create({...input, savedCardReference: "pm_one", billingStartsAt: "2099-01-01"});
  assert.equal(result.subscriptionReference, "sub_new");
  assert.equal(result.status, "trialing");
  assert.equal(createParams.customer, "cus_one");
  assert.equal(createParams.default_payment_method, "pm_one");
  assert.equal(createParams.trial_end, +until / 1000);
  assert.equal(createParams.proration_behavior, "none");
  assert.equal(f.student().paymentSubscriptionReference, "sub_new");
  assert.equal(f.student().renewalRecovery, null);
  assert.equal(f.student().subscriptionCancellation, null);
  assert.equal(+f.student().activeUntil, +until);
  assert.equal(f.receipts().length, 1, "The no-charge bridge is not another paid month");
  const checkout = await f.checkouts.get({studentId: "student-a", mode: f.mode});
  assert.equal(+checkout.billingStartsAt, +until);
  assert.equal(checkout.previousSubscriptionReference, "sub_one");
  assert.equal((await f.records.getSubscriptionRecord({mode: f.mode, customerReference: "cus_one", subscriptionReference: "sub_new"})).billingStartsAt.toISOString(), until.toISOString());
});

test("subscribing after paid access expired creates a normally payable new subscription", async () => {
  const f = await paidFixture(); await f.cancel.command(f.cancelInput);
  f.now = new Date("2026-11-15T00:00:00Z");
  const options = await f.manager.options(f.base);
  assert.equal(options.firstChargeAt, undefined);
  let createParams;
  f.stripe.stripeClient.subscriptions.create = async input => {
    createParams = input;
    Object.assign(f.state.subscription, {id: "sub_new", status: "incomplete", current_period_start: +f.now / 1000,
      current_period_end: +new Date("2026-12-15T00:00:00Z") / 1000, latest_invoice: "in_new"});
    Object.assign(f.state.invoice, {id: "in_new", subscription: "sub_new", status: "open", amount_due: 2500,
      amount_paid: 0, amount_remaining: 2500, created: +f.now / 1000, status_transitions: {paid_at: null}, lines: {data: []}});
    f.state.intent.status = "requires_confirmation";
    return {...structuredClone(f.state.subscription), latest_invoice: structuredClone(f.state.invoice)};
  };
  await f.manager.create({...await f.input(), savedCardReference: "pm_one"});
  assert.equal(createParams.trial_end, undefined);
  assert.equal(createParams.payment_behavior, "default_incomplete");
  assert.equal(f.student().applicationStatus, "suspended");
  assert.equal(f.receipts().length, 1);
});

test("cancellation cannot overwrite a newer student's subscription", async () => {
  const f = await paidFixture();
  f.memory.put("subscriptions/student-a", {...f.student(), billingSummary: {...f.student().billingSummary, paymentSubscriptionReference: "sub_new"}});
  await assert.rejects(() => f.cancel.command(f.cancelInput), {code: "failed-precondition"});
  assert.equal(f.cancelCalls.length, 0);
  assert.equal(f.student().billingSummary.paymentSubscriptionReference, "sub_new");
});

test("the worker projects access suspension at expiry and cannot suspend a replacement subscription", async () => {
  const f = await paidFixture(); await f.cancel.command(f.cancelInput);
  f.now = new Date("2026-11-01T00:00:00Z");
  await f.cancel.execute({limit: 25});
  assert.equal(f.student().applicationStatus, "suspended");
  assert.equal((await f.request()).nextActionAt, null);
  await f.process(f.event("customer.subscription.deleted"));
  assert.equal(f.student().applicationStatus, "suspended", "A late cancellation webhook cannot reactivate expired paid access");
  const newer = await paidFixture(); await newer.cancel.command(newer.cancelInput);
  newer.memory.put("subscriptions/student-a", {...newer.student(), subscriptionCancellation: null,
    paymentSubscriptionReference: "sub_new", applicationStatus: "active"});
  newer.now = new Date("2026-11-01T00:00:00Z"); await newer.cancel.execute({limit: 25});
  assert.equal(newer.student().applicationStatus, "active");
});

test("a successful recovery removes an unusually long original grace period before cancellation", async () => {
  const f = recoveryFixture(); f.policy.gracePeriodHours = 1680; await f.initialize();
  const repository = new FirestoreSubscriptionCancellationRepository({...f.memory.dependencies, now: () => f.now});
  f.outcomes.push("processing"); await f.command();
  f.provider.cancelSubscriptionNow = async () => {f.subscription.status = "canceled"; return {cancelled: true};};
  const cancel = new CancelStudentSubscription({...f.dependencies, repository, episodeRepository: f.repo, recovery: f.controller});
  await cancel.command(f.input());
  const attempt = (await f.episode()).attempt;
  Object.assign(f.payments.get(attempt.paymentIntentReference), {status: "succeeded", paidAt: f.now});
  await cancel.reconcile(f.input());
  assert.ok(f.student().activeUntil < (await f.episode()).graceUntil);
  assert.equal(+f.student().subscriptionCancellation.accessUntil, +f.student().activeUntil);
});
