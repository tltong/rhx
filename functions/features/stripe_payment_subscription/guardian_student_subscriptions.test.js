const assert = require("node:assert/strict");
const {test} = require("node:test");
const {fixture} = require("./test_support/guardian_subscription_fixture");
const {createGuardianSubscriptionHandlers} = require("../../stripe_guardian_subscriptions");

test("student options list only current links and expose a priced plan without private student data", async () => {
  const f = await fixture();
  const options = await f.manager.options({internalReference: "guardian-a"});
  assert.equal(options.selectedStudentId, "student-a"); assert.equal(options.canCreate, true);
  assert.deepEqual(options.students.map(s => s.studentName), ["Alice", "Ben"]);
  assert.match(options.plans[0].quoteReference, /^[a-f0-9]{64}$/);
  assert.equal(options.plans[0].amount, 2500); assert.equal(JSON.stringify(options).includes("private"), false);
  f.links = [];
  assert.equal((await f.manager.options({internalReference: "guardian-a"})).blockedReason, "no_linked_students");
});
test("existing incomplete subscriptions are resumed rather than offering another checkout", async () => {
  const f = await fixture({registered: true});
  const options = await f.manager.options({internalReference: "guardian-a", subscriptionReference: "sub_one"});
  assert.equal(options.subscriptionReference, "sub_one"); assert.equal(options.canCreate, false);
  await assert.rejects(() => f.manager.prepare({...f.base, planId: "monthly", idempotencyReference: "attempt"}), {code: "failed-precondition"});
  assert.equal(f.setupCalls.length, 0);
});
test("the selected billing summary takes precedence over an older application payment link", async () => {
  const f = await fixture({registered: true});
  f.memory.put("subscriptions/student-a", {...f.student(), subscriptionType: "ongoing", paymentProvider: "stripe", paymentMode: f.mode,
    paymentCustomerReference: "cus_one", paymentSubscriptionReference: "sub_old", planId: "monthly",
    billingSummary: {paymentProvider: "stripe", paymentMode: f.mode, paymentSubscriptionReference: "sub_one"}});
  const options = await f.manager.options(f.base);
  assert.equal(options.subscriptionReference, "sub_one"); assert.equal(options.canCreate, false);
});
test("unavailable plan catalogs do not prevent managing an existing payment", async () => {
  const f = await fixture({registered: true});
  f.dependencies.listSubscriptionPlanChoices = async () => {throw Error("Catalog unavailable");};
  const options = await f.manager.options(f.base);
  assert.equal(options.subscriptionReference, "sub_one"); assert.deepEqual(options.plans, []);
  assert.equal(options.canCreate, false); assert.equal(options.canChangePlan, false);
});
test("inactive or foreign students cannot be queried or charged", async () => {
  const f = await fixture(), input = await f.input(); f.links = ["student-b"];
  for (const action of ["options", "prepare", "create"]) await assert.rejects(() => f.manager[action](input), {code: "permission-denied"});
  assert.equal(f.state.createRequests.length, 0);
});
test("new-card checkout reuses the guardian's customer, verifies setup and initializes the existing billing ledger", async () => {
  for (const mode of ["test", "prod"]) {
    const f = await fixture({mode}), input = await f.input();
    const setup = await f.manager.prepare(input);
    assert.equal(f.setupCalls[0].customer, "cus_one"); assert.equal(f.setupCalls[0].metadata.studentId, "student-a");
    assert.equal(f.setupCalls[0].usage, "off_session"); assert.deepEqual(f.setupCalls[0].payment_method_types, ["card"]);
    await assert.rejects(() => f.manager.create({...input, setupIntentReference: setup.setupIntentReference}), {code: "failed-precondition"});
    f.setup.status = "succeeded";
    const result = await f.manager.create({...input, setupIntentReference: setup.setupIntentReference});
    assert.equal(result.subscriptionReference, "sub_one"); assert.equal(result.status, "incomplete");
    assert.equal((await f.read("in_initial")).paymentState, "unpaid");
    assert.equal(f.student().subscriptionType, "trial"); assert.equal(f.receipts().length, 0);
  }
});
test("setup from another student or a changed plan quote cannot create a subscription", async () => {
  const f = await fixture(), input = await f.input(); await f.manager.prepare(input); f.setup.status = "succeeded";
  f.setup.metadata.studentId = "student-b";
  await assert.rejects(() => f.manager.create({...input, setupIntentReference: "seti_new"}), {code: "failed-precondition"});
  f.billingTerms = {...f.billingTerms, amount: 9900};
  await assert.rejects(() => f.manager.prepare(input), {code: "failed-precondition"});
  await assert.rejects(() => f.manager.create({...input, setupIntentReference: "seti_new"}), {code: "failed-precondition"});
  assert.equal(f.state.createRequests.length, 0);
});
test("switching payment environments invalidates the old quote before preparing a card", async () => {
  const f = await fixture(), input = await f.input();
  f.dependencies.createPaymentProviderContext = async () => ({providerName: "stripe", mode: "test", paymentProvider: f.stripe});
  await assert.rejects(() => f.manager.prepare(input), {code: "failed-precondition"});
  assert.equal(f.setupCalls.length, 0); assert.equal(f.state.createRequests.length, 0);
});
test("a linked sibling can use the guardian's saved card without a second customer or SetupIntent", async () => {
  const f = await fixture({registered: true}); f.state.subscription.status = "active";
  const options = await f.manager.options({internalReference: "guardian-a", studentId: "student-b"});
  assert.equal(options.canCreate, true); assert.equal(options.savedCard.last4, "4242");
  let received;
  f.dependencies.createStripePaymentSubscription = async input => {received = input; return {subscriptionReference: "sub_sibling", status: "incomplete"};};
  await f.manager.create({internalReference: "guardian-a", studentId: "student-b", planId: "monthly",
    quoteReference: options.plans[0].quoteReference, savedCardReference: options.savedCard.paymentMethodReference, idempotencyReference: "sibling"});
  assert.equal(received.customerReference, "cus_one"); assert.equal(received.studentId, "student-b");
  assert.equal(received.paymentMethodReference, "pm_one"); assert.equal(f.setupCalls.length, 0);
  await assert.rejects(() => f.manager.create({internalReference: "guardian-a", studentId: "student-b", planId: "monthly",
    quoteReference: options.plans[0].quoteReference, savedCardReference: "pm_foreign", idempotencyReference: "sibling"}), {code: "failed-precondition"});
});
test("expired saved cards are not offered for a new student subscription", async () => {
  const f = await fixture({registered: true}); f.state.subscription.status = "active"; f.state.method.card.exp_year = 2025;
  const options = await f.manager.options({internalReference: "guardian-a", studentId: "student-b"});
  assert.equal(options.canCreate, true); assert.equal(options.savedCard, null);
});
test("concurrent identical student checkouts reserve one provider idempotency key", async () => {
  const f = await fixture(), input = await f.input(); await f.manager.prepare(input); f.setup.status = "succeeded";
  await Promise.all([f.manager.create({...input, setupIntentReference: "seti_new"}), f.manager.create({...input, setupIntentReference: "seti_new"})]);
  assert.equal(new Set(f.state.createRequests.map(request => request.options.idempotencyKey)).size, 1);
  assert.equal((await f.checkouts.get({studentId: "student-a", mode: f.mode})).subscriptionReference, "sub_one");
});
test("a recorded checkout is retrieved rather than recreated after Stripe idempotency retention expires", async () => {
  const f = await fixture(), input = await f.input(); await f.manager.prepare(input); f.setup.status = "succeeded";
  await f.manager.create({...input, setupIntentReference: "seti_new"});
  f.now = new Date(+f.now + 48 * 3600000);
  await f.common.execute({internalReference: "guardian-a", studentId: "student-a", customerReference: "cus_one",
    paymentMethodReference: "pm_one", country: "Malaysia", planId: "monthly", idempotencyReference: input.idempotencyReference});
  assert.equal(f.state.createRequests.length, 1);
});
test("a saved provider result repairs interrupted registration without another create request", async () => {
  const f = await fixture(), input = await f.input(); await f.manager.prepare(input); f.setup.status = "succeeded";
  const initialize = f.records.initializeSubscriptionRecord.bind(f.records);
  f.records.initializeSubscriptionRecord = async () => {throw Error("Temporary registration failure");};
  await assert.rejects(() => f.manager.create({...input, setupIntentReference: "seti_new"}));
  assert.equal((await f.checkouts.get({studentId: "student-a", mode: f.mode})).subscriptionReference, "sub_one");
  f.records.initializeSubscriptionRecord = initialize;
  f.now = new Date(+f.now + 48 * 3600000);
  const options = await f.manager.options(f.base);
  assert.equal(options.subscriptionReference, "sub_one"); assert.equal(options.canCreate, false);
  assert.equal(f.state.createRequests.length, 1);
});
test("an active subscription rejects a fresh checkout even through the original creation API", async () => {
  const f = await fixture({registered: true}); f.state.subscription.status = "active";
  await assert.rejects(() => f.common.execute({internalReference: "guardian-a", studentId: "student-a", customerReference: "cus_one",
    paymentMethodReference: "pm_one", country: "Malaysia", planId: "monthly", idempotencyReference: "fresh"}), {code: "failed-precondition"});
  assert.equal(f.state.createRequests.length, 0);
});
test("reservation excludes other guardians and separates students even when they submit the same attempt reference", async () => {
  const f = await fixture();
  const input = {...f.base, mode: f.mode, customerReference: "cus_one", paymentMethodReference: "pm_one",
    country: "Malaysia", planId: "monthly", billingTerms: f.billingTerms, idempotencyReference: "same", allowedPreviousReference: null};
  const first = await f.checkouts.claim(input);
  await assert.rejects(() => f.checkouts.claim({...input, internalReference: "other"}), {code: "failed-precondition"});
  const sibling = await f.checkouts.claim({...input, studentId: "student-b"});
  assert.notEqual(first.idempotencyReference, sibling.idempotencyReference);
  f.now = new Date(+f.now + 24 * 3600000);
  await assert.rejects(() => f.checkouts.claim(input), {code: "failed-precondition"});
});
test("callables require authentication and bind guardian, email, customer, country and amounts on the server", async () => {
  let seen;
  const handlers = createGuardianSubscriptionHandlers({getStripeGuardianSubscriptionOptions: async input => {seen = input; return {};},
    prepareStripeStudentSubscription: async input => {seen = input; return {};},
    createStripeStudentSubscription: async input => {seen = input; return {};}});
  await assert.rejects(() => handlers.getOptions({data: {}}), {code: "unauthenticated"});
  await handlers.create({auth: {uid: "guardian-a", token: {email: "trusted@example.test"}}, data: {studentId: "student-a",
    planId: "monthly", quoteReference: "a".repeat(64), savedCardReference: "pm_one", idempotencyReference: "a",
    internalReference: "other", customerReference: "cus_foreign", country: "other", amount: 1, email: "forged@example.test"}});
  assert.equal(seen.internalReference, "guardian-a"); assert.equal(seen.email, "trusted@example.test");
  assert.equal(seen.customerReference, undefined); assert.equal(seen.country, undefined); assert.equal(seen.amount, undefined);
});
