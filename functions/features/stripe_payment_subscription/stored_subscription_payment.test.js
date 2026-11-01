const assert = require("node:assert/strict");
const {test} = require("node:test");
const {fixture} = require("./test_support/guardian_subscription_fixture");
const {SubscriptionPaymentViews} = require("./application/subscription_payment_views");
const {ReadStoredSubscriptionPayments} = require("./application/read_stored_subscription_payments");
const {ManageStripeSubscriptionPayment} = require("./application/manage_stripe_subscription_payment");
const {FirestoreSubscriptionPaymentViewRepository} = require("../syllabus_subscription/infrastructure/firestore_subscription_payment_view_repository");
const {withMetadata} = require("../syllabus_subscription/domain/subscription_payment_view");
const {normalizePaymentDetails, createStripeSubscriptionHandlers} = require("../../stripe_payment_subscription");
const input = {internalReference: "guardian-a", subscriptionReference: "sub_one"};
async function setup() {
  const f = await fixture({registered: true});
  f.pay(); await f.process(f.event("invoice.paid"));
  const d = {...f.dependencies, getPaymentConfig: async () => ({provider: "stripe", mode: f.mode}),
    getSubscriptionRecord: v => f.records.getSubscriptionRecord(v),
    getCustomerRecordByReference: v => f.records.getCustomerRecordByReference(v),
    getInvoiceRecord: v => f.billing.getInvoiceRecord(v),
    createPaymentProviderForContext: async ({mode}) => {
      assert.equal(mode, f.mode); return {providerName: "stripe", mode, paymentProvider: f.stripe};
    }};
  const repo = new FirestoreSubscriptionPaymentViewRepository({...f.memory.dependencies, now: () => f.now});
  const live = new ManageStripeSubscriptionPayment(d);
  const views = new SubscriptionPaymentViews({...d, repository: repo, readLive: (v, owned) => live.getDetails(v, owned)});
  const reader = new ReadStoredSubscriptionPayments({...d, views});
  const scope = await views.scope(input);
  return Object.assign(f, {d, repo, views, reader, scope});
}
test("opening options and details queues backfill without any Stripe request", async () => {
  const f = await setup(); f.state.requests.length = 0;
  f.d.createPaymentProviderForContext = () => assert.fail("Stored reads must not construct Stripe");
  const options = await f.reader.getOptions({internalReference: "guardian-a"});
  const details = await f.reader.getDetails(input);
  assert.equal(options.subscriptionReference, "sub_one");
  assert.equal(options.canCreate, false);
  assert.equal(details.syncState.state, "pending");
  assert.equal(details.paymentState, "paid");
  assert.equal(details.currentCard, null);
  assert.equal((await f.repo.listDue()).length, 1);
  assert.deepEqual(f.state.requests, []);
});
test("explicit refresh and backfill populate cards and dates; subsequent reads use schema only", async () => {
  const f = await setup(); await f.views.refresh(f.scope);
  assert.ok(f.state.requests.length > 0);
  f.state.requests.length = 0;
  f.state.retrievalError = Error("Stripe offline");
  const details = await f.reader.getDetails(input), options = await f.reader.getOptions({internalReference: "guardian-a"});
  assert.equal(details.syncState.state, "current");
  assert.equal(details.currentCard.last4, "4242");
  assert.ok(details.nextChargeAt);
  assert.equal(options.currentPlanId, "monthly");
  assert.deepEqual(f.state.requests, []);
});
test("failed Stripe refresh retains last confirmed details and a pending indicator", async () => {
  const f = await setup(); await f.views.refresh(f.scope);
  const confirmed = (await f.repo.get(f.scope)).observedAt;
  f.state.retrievalError = Error("upstream unavailable");
  assert.equal(await f.views.refresh(f.scope), null);
  const details = await f.reader.getDetails(input);
  assert.equal(details.paymentState, "paid");
  assert.equal(details.currentCard.last4, "4242");
  assert.equal(details.syncState.state, "pending");
  assert.equal(details.syncState.unavailable, true);
  assert.equal(details.syncState.lastConfirmedAt, confirmed.toISOString());
  assert.ok((await f.repo.get(f.scope)).nextActionAt > f.now);
});
test("a newer failed-renewal webhook summary is visible before projection refresh", async () => {
  const f = await setup(); await f.views.refresh(f.scope);
  f.now = new Date(+f.now + 3600000);
  const root = f.memory.store.get("subscriptions/student-a");
  f.memory.put("subscriptions/student-a", {...root, billingSummary: {...root.billingSummary,
    billingReason: "subscription_cycle", paymentState: "authentication_required", paymentIntentStatus: "requires_action",
    subscriptionStatus: "past_due", observedAt: f.now, updatedAt: f.now, amountRemaining: 2500}});
  f.state.requests.length = 0;
  const details = await f.reader.getDetails(input);
  assert.equal(details.paymentState, "authentication_required");
  assert.equal(details.renewal.action, "confirm_payment");
  assert.equal(details.renewal.requiresActionFetch, true);
  assert.equal(details.renewal.paymentClientSecret, null);
  assert.equal(details.syncState.state, "pending");
  assert.equal((await f.repo.get(f.scope)).pending, true);
  assert.deepEqual(f.state.requests, []);
  assert.doesNotThrow(() => normalizePaymentDetails(details, "sub_one"));
});
test("private view strips secrets and supports deferred bank authentication", async () => {
  const f = await setup(); await f.views.refresh(f.scope);
  const details = await f.reader.getDetails(input);
  const secret = "pi_one_secret_never_persist";
  await f.repo.save(f.scope, {...details, paymentClientSecret: secret, clientSecret: secret,
    renewal: {subscriptionReference: "sub_one", invoiceReference: "in_initial", billingReason: "subscription_cycle",
      action: "confirm_payment", paymentClientSecret: secret, amountDue: 2500, currency: "myr", canRetry: false,
      savedCard: {...details.currentCard, clientSecret: secret}, metadata: {secret}}});
  const stored = await f.repo.get(f.scope);
  assert.ok(!JSON.stringify(stored).includes(secret));
  assert.ok(!JSON.stringify(stored.payload).includes("pm_one"));
  const response = normalizePaymentDetails(await f.reader.getDetails(input), "sub_one");
  assert.equal(response.renewal.requiresActionFetch, true);
  assert.equal(response.renewal.paymentClientSecret, null);
});
test("confirmed processing still displays Updating until the final payment result arrives", async () => {
  const f = await setup(); await f.views.refresh(f.scope);
  await f.repo.save(f.scope, {...await f.reader.getDetails(input), paymentState: "processing", recoveryPending: true});
  assert.equal((await f.repo.get(f.scope)).pending, false);
  assert.equal((await f.reader.getDetails(input)).syncState.state, "pending");
});
test("guardian ownership, current links, modes and old invoice links are checked without Stripe", async () => {
  const f = await setup(); f.state.requests.length = 0;
  await assert.rejects(f.reader.getDetails({...input, internalReference: "another"}), {code: "not-found"});
  await assert.rejects(f.reader.getOptions({internalReference: "guardian-a", studentId: "unlinked"}), {code: "permission-denied"});
  await assert.rejects(f.reader.getDetails({...input, invoiceReference: "in_foreign"}), {code: "not-found"});
  f.links = [];
  await assert.rejects(f.reader.getDetails(input), {code: "permission-denied"});
  await assert.rejects(f.repo.get({...f.scope, guardianId: "another"}), {code: "failed-precondition"});
  assert.deepEqual(f.state.requests, []);
});
test("a refresh started before a command cannot overwrite its confirmed card", async () => {
  const f = await setup(); await f.views.refresh(f.scope);
  const stale = await f.reader.getDetails(input), claim = await f.repo.claim(f.scope);
  await f.repo.request(f.scope, "card_change", true);
  await f.repo.patchCard(f.scope, {paymentMethodReference: "pm_new", card: {...stale.currentCard, last4: "4444"}});
  assert.equal(await f.repo.save(f.scope, stale, null, "pm_one", claim), null);
  const stored = await f.repo.get(f.scope);
  assert.equal(stored.payload.currentCard.last4, "4444");
  assert.equal(stored.defaultPaymentMethodReference, "pm_new");
  assert.equal(stored.pending, true);
});
test("a failed obsolete refresh cannot postpone a newer webhook's repair", async () => {
  const f = await setup(); await f.repo.request(f.scope);
  const claim = await f.repo.claim(f.scope);
  await f.repo.request(f.scope, "webhook", true);
  await f.repo.fail(f.scope, claim);
  assert.equal(+(await f.repo.get(f.scope)).nextActionAt, +f.now);
});
test("confirmed commands persist immediately and repair jobs never repeat the command", async () => {
  const f = await setup(); await f.views.refresh(f.scope);
  let commands = 0;
  const initial = await f.reader.getDetails(input);
  await f.views.command(input, async () => {
    commands++;
    return withMetadata({...initial, currentCard: {...initial.currentCard, last4: "4444"}}, {status: "active", defaultPaymentMethodReference: "pm_new"});
  });
  assert.equal((await f.reader.getDetails(input)).currentCard.last4, "4444");
  const claim = await f.repo.claim(f.scope); assert.ok(claim);
  assert.equal(await f.repo.claim(f.scope), null);
  await f.repo.fail(f.scope, claim);
  assert.equal(commands, 1);
});
test("an interruption after a confirmed command does not report payment failure", async () => {
  const f = await setup();
  f.views.capture = async () => {throw Error("database unavailable after payment");};
  const result = {subscriptionReference: "sub_one", studentId: "student-a", subscriptionStatus: "active", currentCard: null};
  assert.equal(await f.views.command(input, async () => result), result);
  assert.equal((await f.repo.get(f.scope)).pending, true);
});
test("due reconciliation uses recorded mode and leaves healthy views until the renewal date", async () => {
  const f = await setup(); await f.repo.request(f.scope);
  assert.equal((await f.views.execute()).examined, 1);
  assert.equal((await f.repo.listDue()).length, 0);
  f.now = new Date(+new Date((await f.repo.get(f.scope)).payload.nextChargeAt) + 180000);
  assert.equal((await f.repo.listDue()).length, 1);
});
test("status callable validates and forwards only an explicit boolean refresh option", async () => {
  const received = [];
  const handlers = createStripeSubscriptionHandlers({getSubscriptionPaymentDetails: async v => {received.push(v); return {subscriptionReference: "sub_one", subscriptionStatus: "active"};}});
  const request = {auth: {uid: "guardian-a"}, data: {subscriptionReference: "sub_one", refreshFromStripe: true}};
  await handlers.getStripeSubscriptionPaymentDetailsHandler(request);
  assert.equal(received[0].refreshFromStripe, true);
  await assert.rejects(handlers.getStripeSubscriptionPaymentDetailsHandler({...request, data: {...request.data, refreshFromStripe: "true"}}), {code: "invalid-argument"});
});
test("guardian options callable forwards explicit refresh without trusting customer identity", async () => {
  const {createGuardianSubscriptionHandlers} = require("../../stripe_guardian_subscriptions");
  let seen;
  const handlers = createGuardianSubscriptionHandlers({getStripeGuardianSubscriptionOptions: async v => {seen = v; return {};}});
  const request = {auth: {uid: "guardian-a"}, data: {studentId: "student-a", refreshFromStripe: true, internalReference: "forged", customerReference: "forged"}};
  await handlers.getOptions(request);
  assert.equal(seen.internalReference, "guardian-a"); assert.equal(seen.refreshFromStripe, true);
  assert.equal(seen.customerReference, undefined);
  await assert.rejects(handlers.getOptions({...request, data: {...request.data, refreshFromStripe: "true"}}), {code: "invalid-argument"});
});
test("backfill defaults to a dry run and preserves existing registered views", async () => {
  const f = await setup(); await f.repo.request(f.scope);
  const {backfill} = require("../../../scripts/backfill-subscription-payment-views");
  const records = [{id: "sub_one", data: () => ({studentId: "student-a"})},
    {id: "sub_two", data: () => ({studentId: "student-b"})}, {id: "sub_unregistered", data: () => ({})}];
  const db = {collection: path => ({get: async () => ({docs: path.includes("/prod/") ? [{id: "cus_one",
    data: () => ({internalReference: "guardian-a"}), ref: {collection: () => ({get: async () => ({docs: records})})}}] : []})})};
  assert.deepEqual(await backfill({db, repository: f.repo}), {registered: 2, existing: 1, missing: 1, queued: 0});
  assert.equal((await f.repo.listDue()).length, 1);
  assert.deepEqual(await backfill({db, repository: f.repo, apply: true}), {registered: 2, existing: 1, missing: 1, queued: 1});
  assert.equal((await f.repo.listDue()).length, 2);
  assert.equal((await backfill({db, repository: f.repo, apply: true})).queued, 0);
});
test("runtime APIs use stored reads, explicit refresh and webhook-maintained views", async t => {
  const f = await setup();
  t.mock.timers.enable({apis: ["Date"], now: +f.now});
  const restores = [];
  const patch = (path, values) => {
    const target = require(path), old = {...target}; Object.assign(target, values);
    restores.push(() => {for (const key of Object.keys(values)) target[key] = old[key];});
  };
  patch("../payment_factory/payment_factory_module", {
    createPaymentProviderContext: f.dependencies.createPaymentProviderContext,
    createPaymentProviderForContext: f.d.createPaymentProviderForContext});
  patch("../payment/payment_module", {getPaymentConfig: f.d.getPaymentConfig});
  patch("../guardian_student_link/guardian_student_link_module", {
    getGuardianStudentLink: f.d.getGuardianStudentLink, listActiveGuardianStudentLinks: f.d.listActiveGuardianStudentLinks});
  patch("../student/student_module", {getStudentById: f.d.getStudentById});
  patch("../stripe_customer/stripe_customer_module", {
    getSubscriptionRecord: f.d.getSubscriptionRecord, getCustomerRecordByReference: f.d.getCustomerRecordByReference,
    getCustomerRecordByInternalReference: f.d.getCustomerRecordByInternalReference,
    listSubscriptionRecords: f.d.listSubscriptionRecords,
    writePaymentMethodRecord: v => f.records.writePaymentMethodRecord(v)});
  patch("../stripe_payment/stripe_payment_module", {createStripePayment: () => f.stripe});
  patch("../syllabus_subscription/student_subscription_module", {getStudentSubscription: f.d.getStudentSubscription});
  patch("../syllabus_subscription/student_checkout_module", {getStudentSubscriptionCheckout: f.d.getStudentSubscriptionCheckout});
  patch("../syllabus_subscription/subscription_plan_module", {listSubscriptionPlanChoices: f.d.listSubscriptionPlanChoices});
  const {FirestoreSubscriptionCancellationRepository} = require("../syllabus_subscription/infrastructure/firestore_subscription_cancellation_repository");
  const {FirestoreRenewalEpisodeRepository} = require("../syllabus_subscription/infrastructure/firestore_renewal_episode_repository");
  patch("../syllabus_subscription/subscription_billing_module", {
    subscriptionPaymentViewRepository: f.repo,
    subscriptionCancellationRepository: new FirestoreSubscriptionCancellationRepository({...f.memory.dependencies, now: () => f.now}),
    renewalEpisodeRepository: new FirestoreRenewalEpisodeRepository({...f.memory.dependencies, now: () => f.now}),
    getInvoiceRecord: f.d.getInvoiceRecord, recordInvoicePaymentEvent: v => f.billing.recordInvoicePaymentEvent(v)});
  const path = require.resolve("./stripe_payment_subscription_module"), original = require.cache[path];
  delete require.cache[path];
  try {
    const api = require(path);
    f.state.requests.length = 0;
    await api.getStripeGuardianSubscriptionOptions({internalReference: "guardian-a"});
    assert.equal((await api.getStripeSubscriptionPaymentDetails(input)).syncState.state, "pending");
    assert.deepEqual(f.state.requests, []);
    assert.equal((await api.getStripeSubscriptionPaymentDetails({...input, refreshFromStripe: true})).currentCard.last4, "4242");
    assert.ok(f.state.requests.length > 0);
    f.state.requests.length = 0;
    await api.getStripeGuardianSubscriptionOptions({internalReference: "guardian-a"});
    await api.getStripeSubscriptionPaymentDetails(input);
    assert.deepEqual(f.state.requests, []);
    f.state.method.card.last4 = "4444";
    await api.processStripeSubscriptionEvent({mode: f.mode, event: f.event("invoice.paid", "evt_view_refresh")});
    assert.equal((await api.getStripeSubscriptionPaymentDetails(input)).currentCard.last4, "4444");
    f.state.requests.length = 0;
    await api.getStripeGuardianSubscriptionOptions({internalReference: "guardian-a", refreshFromStripe: true});
    assert.ok(f.state.requests.length > 0);
    // Stripe collected the next renewal but its webhook never arrived.
    const start = new Date("2026-11-01T00:00:00Z"), end = new Date("2026-12-01T00:00:00Z");
    f.now = start; t.mock.timers.setTime(+start);
    Object.assign(f.state.subscription, {latest_invoice: "in_renewal", current_period_start: +start / 1000, current_period_end: +end / 1000});
    Object.assign(f.state.invoice, {id: "in_renewal", billing_reason: "subscription_cycle", created: +start / 1000,
      status_transitions: {paid_at: +start / 1000}});
    f.state.invoice.lines.data[0].period = {start: +start / 1000, end: +end / 1000};
    const refreshed = await api.getStripeSubscriptionPaymentDetails({...input, refreshFromStripe: true});
    assert.equal(refreshed.paymentState, "paid");
    assert.equal((await f.d.getStudentSubscription("student-a")).activeUntil.toISOString(), end.toISOString());
  } finally {
    restores.reverse().forEach(fn => fn());
    delete require.cache[path]; if (original) require.cache[path] = original;
  }
});
