const assert = require("node:assert/strict");
const {test} = require("node:test");
const {makeBillingFixture, NOW, END} = require("./test_support/billing_fixture");
const {FirestoreStudentSubscriptionRepository} = require("./infrastructure/firestore_student_subscription_repository");
const after = (date, seconds = 1) => new Date(date.getTime() + seconds * 1000);

test("initial and recurring success/failure have separate invoices and one receipt per paid period", async () => {
  for (const paymentMode of ["test", "prod"]) {
    const f = makeBillingFixture(); f.scope.paymentMode = paymentMode;
    const originalTrial = f.student().activeUntil;
    await f.billing.initializeInvoiceRecord(f.input());
    await f.event({paymentState: "failed", paymentIntentStatus: "requires_payment_method", attemptCount: 1,
      failureCode: "insufficient_funds", lastFailedAt: NOW});
    assert.equal(f.student().billingSummary.paymentState, "failed");
    assert.equal(f.student().subscriptionType, "trial");
    assert.deepEqual(f.student().activeUntil, originalTrial);
    assert.equal(f.receipts().length, 0);
    await f.paid();
    assert.equal(f.student().subscriptionType, "ongoing");
    assert.deepEqual(f.student().activeUntil, END);
    assert.equal(f.student().paymentMode, paymentMode);
    assert.equal(f.receipts()[0][1].amountPaid, 25);
    const cycle = {invoiceReference: "in_renewal", billingReason: "subscription_cycle", invoiceCreatedAt: END,
      observedAt: END, billingPeriodStart: END, billingPeriodEnd: new Date("2026-12-01T00:00:00Z")};
    await f.event({...cycle, paymentState: "failed", subscriptionStatus: "past_due", failureCode: "insufficient_funds",
      attemptCount: 1, lastFailedAt: END}, {}, "evt_renew_failed");
    assert.deepEqual(f.student().activeUntil, END);
    assert.equal(f.receipts().length, 1);
    await f.paid(cycle, {}, "evt_renew_paid");
    assert.deepEqual(f.student().activeUntil, new Date("2026-12-01T00:00:00Z"));
    assert.equal(f.receipts().length, 2);
    assert.equal((await f.read("in_initial")).paymentState, "paid");
    assert.equal((await f.read("in_renewal")).paymentState, "paid");
  }
});

test("duplicate and concurrent webhook delivery cannot duplicate receipts or extend access twice", async () => {
  const f = makeBillingFixture();
  const results = await Promise.all([f.paid(), f.paid(), f.paid()]);
  assert.equal(results.filter(r => r.duplicate).length, 2);
  assert.equal(f.receipts().length, 1);
  assert.deepEqual(f.student().activeUntil, END);
  await f.paid({observedAt: after(NOW)}, {}, "evt_another_delivery");
  assert.equal(f.receipts().length, 1);
  assert.deepEqual(f.student().activeUntil, END);
  assert.ok(f.memory.transactionAttempts > 3);
});

test("a delayed failure cannot replace paid invoice or paid summary", async () => {
  const f = makeBillingFixture(); await f.paid();
  await f.event({observedAt: after(NOW), paymentState: "failed", attemptCount: 2,
    failureCode: "insufficient_funds", lastFailedAt: after(NOW)}, {}, "evt_delayed_failure");
  assert.equal((await f.read()).paymentState, "paid");
  assert.equal(f.student().billingSummary.paymentState, "paid");
  assert.equal(f.student().billingSummary.failureCode, null);
  assert.equal(f.receipts().length, 1);
});

test("stale observed snapshots and attempt counts cannot roll payment progress backward", async () => {
  const f = makeBillingFixture();
  await f.event({paymentState: "processing", paymentIntentStatus: "processing", observedAt: after(NOW, 10), attemptCount: 2});
  await f.event({paymentState: "failed", observedAt: after(NOW, 5), attemptCount: 1}, {}, "evt_late");
  assert.equal((await f.read()).paymentState, "processing");
});

test("initialization racing with a paid webhook preserves paid history and the receipt", async () => {
  const f = makeBillingFixture();
  f.memory.beforeCommit = async () => {f.memory.beforeCommit = null; await f.paid();};
  await f.billing.initializeInvoiceRecord(f.input());
  assert.equal((await f.read()).paymentState, "paid");
  assert.equal(f.receipts().length, 1);
  assert.equal(f.student().billingSummary.paymentState, "paid");
});

test("paying an older invoice retains the latest unpaid summary and grants only its paid period", async () => {
  const f = makeBillingFixture(); await f.paid();
  await f.event({invoiceReference: "in_future", billingReason: "subscription_cycle", invoiceCreatedAt: END,
    observedAt: END, billingPeriodStart: END, billingPeriodEnd: new Date("2026-12-01T00:00:00Z"),
    paymentState: "failed", subscriptionStatus: "past_due", attemptCount: 1}, {}, "evt_future_failed");
  const summary = f.student().billingSummary;
  await f.paid({invoiceReference: "in_arrears", invoiceCreatedAt: after(NOW, 3), isLatestInvoice: false,
    billingReason: "subscription_cycle", observedAt: after(END)}, {}, "evt_old_paid");
  assert.deepEqual(f.student().billingSummary, summary);
  assert.deepEqual(f.student().activeUntil, END);
});

test("old subscription events cannot replace a newer billing subscription or shorten access", async () => {
  const f = makeBillingFixture(); await f.paid();
  await f.paid({invoiceReference: "in_new", subscriptionRegisteredAt: END, invoiceCreatedAt: END, observedAt: END,
    billingPeriodStart: END, billingPeriodEnd: new Date("2026-12-01T00:00:00Z")}, {paymentSubscriptionReference: "sub_new"}, "evt_new");
  const parent = f.student();
  await f.paid({invoiceReference: "in_old", observedAt: after(END), invoiceCreatedAt: after(NOW)}, {}, "evt_old");
  assert.deepEqual(f.student(), parent);
  assert.equal(f.receipts().length, 3);
});

test("test invoices never change production access or the production billing summary", async () => {
  const f = makeBillingFixture(); await f.paid(); const parent = f.student();
  await f.paid({billingPeriodEnd: new Date("2030-01-01Z"), observedAt: after(NOW)}, {paymentMode: "test"}, "evt_test");
  assert.deepEqual(f.student(), parent);
  assert.equal((await f.read("in_initial", {paymentMode: "test"})).paymentState, "paid");
  assert.equal(f.receipts().length, 2);
  assert.deepEqual(new Set(f.receipts().map(([, r]) => r.paymentMode)), new Set(["prod", "test"]));
});

test("production replaces test coverage using the real paid period instead of preserving fake future access", async () => {
  const f = makeBillingFixture();
  await f.paid({billingPeriodEnd: new Date("2030-01-01Z")}, {paymentMode: "test"});
  await f.paid({}, {}, "evt_real_payment");
  assert.equal(f.student().paymentMode, "prod");
  assert.deepEqual(f.student().activeUntil, END);
});

test("only a settled invoice can be marked paid, and missing/ambiguous coverage grants no access", async () => {
  const f = makeBillingFixture();
  await assert.rejects(() => f.event({paymentState: "paid"}), /settled invoice/);
  assert.equal(f.receipts().length, 0);
  await f.paid({billingPeriodStart: null, billingPeriodEnd: null});
  assert.equal(f.student().subscriptionType, "trial");
  assert.equal(f.receipts().length, 0);
  assert.equal((await f.read()).paymentState, "paid");
});

test("zero-amount fully paid invoices can grant their covered period", async () => {
  const f = makeBillingFixture(); await f.paid({amountDue: 0, amountPaid: 0});
  assert.equal(f.receipts()[0][1].amountPaid, 0);
  assert.deepEqual(f.student().activeUntil, END);
});

test("invoice and event identity cannot be reassigned to another checkout", async () => {
  const f = makeBillingFixture(); await f.paid();
  await assert.rejects(() => f.event({guardianId: "other"}, {}, "evt_forged"), /identity/);
  await assert.rejects(() => f.event({invoiceReference: "in_other"}, {}, "evt_paid"), /identity/);
  assert.equal((await f.read()).guardianId, "guardian-a");
  assert.equal(f.receipts().length, 1);
});

test("unavailable/deleted student cannot leave an invoice or processed event orphan", async () => {
  const f = makeBillingFixture();
  f.memory.beforeCommit = async () => {f.memory.beforeCommit = null; f.memory.remove("subscriptions/student-a");};
  await assert.rejects(() => f.paid(), e => e.code === "not-found");
  assert.equal(await f.read(), null);
  assert.equal(f.receipts().length, 0);
});

test("invoice reads and pagination stay within provider/mode/subscription scope", async () => {
  const f = makeBillingFixture();
  for (let i = 0; i < 5; i++) await f.event({invoiceReference: `in_${i}`}, {}, `evt_${i}`);
  await f.event({invoiceReference: "in_test"}, {paymentMode: "test"}, "evt_test");
  await f.event({invoiceReference: "in_other"}, {paymentSubscriptionReference: "sub_other"}, "evt_other");
  const first = await f.billing.listInvoiceRecords({...f.scope, limit: 2});
  const second = await f.billing.listInvoiceRecords({...f.scope, limit: 2, cursor: first.nextCursor});
  const third = await f.billing.listInvoiceRecords({...f.scope, limit: 2, cursor: second.nextCursor});
  assert.equal(new Set([...first.invoices, ...second.invoices, ...third.invoices].map(x => x.invoiceReference)).size, 5);
  assert.equal(third.nextCursor, null);
  await assert.rejects(() => f.billing.listInvoiceRecords({...f.scope, cursor: "wrong_scope"}));
  assert.equal(await f.billing.getInvoiceRecord({...f.scope, invoiceReference: "in_test"}), null);
});

test("ordinary student saves preserve server-owned billing summaries", async () => {
  const f = makeBillingFixture(); await f.paid(); const before = f.student().billingSummary;
  f.memory.put("subscriptions/student-a", {...f.student(), applicationStatus: "suspended"});
  const repo = new FirestoreStudentSubscriptionRepository(f.memory.dependencies);
  const student = await repo.getSubscription("student-a");
  assert.equal(student.billingSummary.paymentState, "paid");
  student.update({billingSummary: {paymentState: "failed"}, applicationStatus: "active"});
  await repo.saveSubscription(student);
  assert.deepEqual(f.student().billingSummary, before);
  assert.equal(student.applicationStatus, "suspended");
  assert.equal(f.student().applicationStatus, "suspended");
});

test("normalized records exclude secrets and raw Stripe payloads", async () => {
  const f = makeBillingFixture();
  await f.event({paymentClientSecret: "pi_secret_must_not_persist", rawStripe: {number: "sensitive"}});
  assert.equal(JSON.stringify([...f.memory.store.values()]).includes("pi_secret"), false);
  assert.equal(JSON.stringify([...f.memory.store.values()]).includes("sensitive"), false);
});

test("a transaction failure leaves no processed marker, receipt or partial access update", async () => {
  const f = makeBillingFixture();
  f.memory.beforeCommit = () => {f.memory.beforeCommit = null; throw Error("database unavailable");};
  await assert.rejects(() => f.paid(), /database unavailable/);
  assert.equal(await f.read(), null);
  assert.equal(f.receipts().length, 0);
  assert.equal([...f.memory.store.keys()].some(k => k.includes("/billingEvents/")), false);
  assert.equal(f.student().subscriptionType, "trial");
  await f.paid();
  assert.equal(f.receipts().length, 1);
});
