const assert = require("node:assert/strict");
const {test} = require("node:test");
const {planFixture} = require("./test_support/guardian_plan_fixture");
const {makeRecoveryFixture} = require("./test_support/renewal_recovery_fixture");
const {FirestoreStripeCustomerRepository} = require("../stripe_customer/infrastructure/firestore_stripe_customer_repository");

test("changing plan schedules the new interval at renewal without changing paid coverage or collecting now", async () => {
  const f = await planFixture(), input = await f.planInput("annual"), before = f.student().activeUntil;
  assert.equal((await f.manager.options(f.base)).canChangePlan, true);
  const options = await f.manager.changePlan(input);
  assert.equal(options.nextPlan.planId, "annual"); assert.equal(options.nextPlan.state, "scheduled");
  assert.equal(options.nextPlan.effectiveAt, "2026-11-01T00:00:00.000Z");
  assert.equal(options.currentPlanId, "monthly"); assert.equal(f.student().activeUntil.getTime(), before.getTime());
  assert.equal(f.state.createRequests.length, 0); assert.equal(f.receipts().length, 1);
  assert.equal(f.schedule.phases[0].items[0].price, "price_monthly");
  assert.equal(f.schedule.phases[1].items[0].price, "price_annual");
  assert.equal(f.schedule.phases[1].start_date, f.schedule.phases[0].end_date);
  assert.equal(f.planCalls[1].input.proration_behavior, "none");
});
test("a lost plan-update response is reconciled without another schedule or update", async () => {
  const f = await planFixture(), input = await f.planInput("annual"); f.losePlanResponse = true;
  await assert.rejects(() => f.manager.changePlan(input));
  const result = await f.manager.changePlan(input);
  assert.equal(result.nextPlan.state, "scheduled");
  assert.equal(f.planCalls.filter(call => call.action === "create").length, 1);
  assert.equal(f.planCalls.filter(call => call.action === "update").length, 1);
});
test("a lost schedule-migration response uses the original provider key before marking ownership", async () => {
  const f = await planFixture(), input = await f.planInput("annual"); f.losePlanCreationResponse = true;
  await assert.rejects(() => f.manager.changePlan(input));
  assert.equal(f.schedule.metadata, undefined);
  const result = await f.manager.changePlan(input);
  assert.equal(result.nextPlan.state, "scheduled"); assert.equal(f.scheduleCreates, 1);
  assert.deepEqual(f.planCalls.find(call => call.action === "create").input, {from_subscription: "sub_one"});
});
test("a new intent can switch back to a previously selected plan without replaying its old provider response", async () => {
  const f = await planFixture();
  await f.manager.changePlan({...await f.planInput("annual"), idempotencyReference: "annual-first"});
  await f.manager.changePlan({...await f.planInput("monthly"), idempotencyReference: "monthly-next"});
  const result = await f.manager.changePlan({...await f.planInput("annual"), idempotencyReference: "annual-again"});
  assert.equal(result.nextPlan.planId, "annual"); assert.equal(f.schedule.phases[1].items[0].price, "price_annual");
  assert.equal(f.planCalls.filter(call => call.action === "create").length, 1);
});
test("a refresh can acknowledge a lost plan response using provider reads only", async () => {
  const f = await planFixture(), input = await f.planInput("annual"); f.losePlanResponse = true;
  await assert.rejects(() => f.manager.changePlan(input));
  const before = f.planCalls.length;
  const options = await f.manager.options(f.base);
  assert.equal(options.nextPlan.state, "scheduled"); assert.equal(f.planCalls.length, before);
});
test("a stale registration projection cannot erase a newer plan history or pending change", async () => {
  const f = await planFixture();
  const scope = {mode: f.mode, customerReference: "cus_one", subscriptionReference: "sub_one"};
  const stale = await f.records.getSubscriptionRecord(scope);
  await f.manager.changePlan(await f.planInput("annual"));
  const repository = new FirestoreStripeCustomerRepository(f.memory.dependencies);
  await repository.writeSubscription(stale);
  const record = await f.records.getSubscriptionRecord(scope);
  assert.equal(record.pendingPlanChange.planId, "annual"); assert.equal(record.planVersions.length, 2);
});
test("a recovered prepaid period can change plans at its paid-through date without shortening the bridge", async () => {
  const f = await planFixture();
  Object.assign(f.state.subscription, {status: "trialing", trial_end: f.state.subscription.current_period_end,
    metadata: {rhx_recovery_version: "1", rhx_recovery_state: "completed"}});
  const options = await f.manager.options(f.base); assert.equal(options.canChangePlan, true);
  const changed = await f.manager.changePlan(await f.planInput("annual"));
  assert.equal(changed.nextPlan.effectiveAt, "2026-11-01T00:00:00.000Z");
  assert.equal(f.schedule.phases[0].trial_end, f.schedule.phases[0].end_date);
  assert.equal(f.schedule.phases[1].trial_end, undefined);
  assert.equal(f.student().activeUntil.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(f.state.createRequests.length, 0);
});
test("unpaid invoices, foreign schedules, canceled subscriptions and changed quotes cannot change plans", async () => {
  for (const condition of ["unpaid", "foreign", "canceled", "quote"]) {
    const f = await planFixture(), input = await f.planInput("annual");
    if (condition === "unpaid") f.openInvoices = [{id: "in_old", amount_remaining: 100}];
    if (condition === "foreign") {
      f.state.subscription.schedule = "sub_sched_other";
      f.schedule = {id: "sub_sched_other", subscription: "sub_one", metadata: {}, phases: []};
    }
    if (condition === "canceled") f.state.subscription.status = "canceled";
    if (condition === "quote") f.terms.annual.amount++;
    await assert.rejects(() => f.manager.changePlan(input), {code: "failed-precondition"});
    assert.equal(f.planCalls.length, 0);
  }
});
test("an incompatible currency is rejected before changing any provider schedule", async () => {
  const f = await planFixture(); f.terms.annual.currency = "usd";
  const input = await f.planInput("annual");
  await assert.rejects(() => f.manager.changePlan(input), {code: "failed-precondition"});
  assert.equal(f.planCalls.length, 0);
});
test("card changes also update both phases of an owned scheduled plan without changing its prices", async t => {
  const f = await planFixture();
  t.mock.timers.enable({apis: ["Date"], now: +f.now});
  await f.manager.changePlan(await f.planInput("annual"));
  await f.stripe.updateSubscriptionPaymentMethod({subscriptionReference: "sub_one", setupIntentReference: "seti_verified", paymentMethodReference: "pm_new"});
  assert.equal(f.state.subscription.default_payment_method, "pm_new");
  assert.equal(f.schedule.phases.every(phase => phase.default_payment_method === "pm_new"), true);
  assert.deepEqual(f.schedule.phases.map(phase => phase.items[0].price), ["price_monthly", "price_annual"]);
});
test("paid invoices after a plan change use the new plan while historical invoices keep their original plan", async () => {
  const f = await planFixture(); await f.manager.changePlan(await f.planInput("annual"));
  const initial = structuredClone(f.state.invoice);
  f.now = new Date("2026-11-01Z");
  Object.assign(f.state.subscription, {latest_invoice: "in_annual", current_period_start: +f.now / 1000,
    current_period_end: +new Date("2027-11-01Z") / 1000});
  f.state.subscription.items.data[0].price.id = "price_annual";
  Object.assign(f.state.invoice, {id: "in_annual", billing_reason: "subscription_cycle", created: +f.now / 1000,
    amount_due: 24000, amount_paid: 24000, amount_remaining: 0, status_transitions: {paid_at: +f.now / 1000}});
  f.state.invoice.lines.data[0].period = {start: +f.now / 1000, end: +new Date("2027-11-01Z") / 1000};
  f.state.invoice.lines.data[0].pricing.price_details.price = "price_annual";
  await f.process(f.event("invoice.paid"));
  assert.equal((await f.read("in_annual")).planId, "annual"); assert.equal((await f.read("in_annual")).durationMonths, 12);
  assert.equal(f.student().planId, "annual"); assert.equal(f.student().activeUntil.toISOString(), "2027-11-01T00:00:00.000Z");
  f.state.invoice = initial; await f.process(f.event("invoice.paid"));
  assert.equal((await f.read("in_initial")).planId, "monthly"); assert.equal((await f.read("in_initial")).durationMonths, 1);
  assert.equal(f.receipts().length, 2);
});
test("failed renewal after a scheduled plan starts releases only its owned schedule and recovers the new term", async () => {
  const f = await makeRecoveryFixture();
  const scope = {mode: f.mode, customerReference: "cus_one", subscriptionReference: "sub_one"};
  const registered = await f.records.getSubscriptionRecord(scope);
  await f.records.writeSubscriptionRecord({...registered, planVersions: [
    {planId: "monthly", priceReference: "price_monthly", amount: 2500, currency: "myr", interval: "month", intervalCount: 1, effectiveAt: new Date("2026-10-01Z")},
    {planId: "quarterly", priceReference: "price_quarterly", amount: 7000, currency: "myr", interval: "month", intervalCount: 3, effectiveAt: new Date("2026-11-01Z")},
  ]});
  f.state.subscription.items = {data: [{price: {id: "price_quarterly", recurring: {usage_type: "licensed"}}, quantity: 1}]};
  f.state.subscription.schedule = "sub_sched_owned";
  f.state.subscription.current_period_end = +new Date("2027-02-01Z") / 1000;
  f.state.invoice.lines.data[0].period.end = +new Date("2027-02-01Z") / 1000;
  f.state.invoice.lines.data[0].pricing = {price_details: {price: "price_quarterly"}};
  let releases = 0;
  f.stripe.stripeClient.subscriptionSchedules = {retrieve: async () => ({id: "sub_sched_owned", subscription: "sub_one",
    metadata: {rhx_plan_change: "1", rhx_subscription: "sub_one", rhx_target_price: "price_quarterly", rhx_effective_at: String(+f.now / 1000)}}),
  release: async () => {releases++; f.state.subscription.schedule = null;}};
  await f.seed(); assert.equal(releases, 1); assert.equal((await f.read("in_renewal")).planId, "quarterly");
  f.state.behavior = "paid"; f.advance(1); await f.worker.execute();
  assert.equal(f.student().applicationStatus, "active"); assert.equal(f.student().planId, "quarterly");
  assert.equal(f.student().activeUntil.toISOString(), "2027-02-01T01:00:00.000Z");
});
