const assert = require("node:assert/strict");
const {test} = require("node:test");
const {fixture} = require("./test_support/stripe_invoice_fixture");
const {loadStripeSubscriptionPaymentDetails} = require("./application/load_stripe_subscription_payment_details");
const {CancelStudentSubscription} = require("./application/cancel_student_subscription");
const {ManageStripeSubscriptionPayment} = require("./application/manage_stripe_subscription_payment");
const {RenewalPaymentRecovery} = require("./application/renewal_payment_recovery");
const {FirestoreSubscriptionCancellationRepository} = require("../syllabus_subscription/infrastructure/firestore_subscription_cancellation_repository");
const {makeTransactionalFirestore} = require("../stripe_customer/test_support/transactional_firestore");
const input = {internalReference: "owner", subscriptionReference: "sub_owner"};
function setup() {
  const f = fixture();
  Object.assign(f.state.invoice, {status: "paid", amount_paid: 2500, amount_remaining: 0, created: 1700000000,
    attempt_count: 1, billing_reason: "subscription_create"});
  Object.assign(f.state.intent, {status: "succeeded"});
  f.state.subscription.status = "active";
  const student = {subscriptionType: "ongoing", paymentProvider: "stripe", paymentMode: "test", paymentSubscriptionReference: "sub_owner",
    planId: "monthly", applicationStatus: "active", activeUntil: new Date("2030-12-01T00:00:00Z")};
  const d = {...f.dependencies, getStudentSubscription: async () => student,
    getGuardianStudentLink: async () => ({isActive: true}), getInvoiceRecord: async () => null};
  const recovery = new RenewalPaymentRecovery({...d, repository: {get() {assert.fail("No recovery is active");}}});
  let reads = 0;
  const cancellation = new CancelStudentSubscription({...d, repository: {async get() {
    reads++;
    return reads > 1 ? f.concurrentCancellation || null : null;
  }}});
  const management = new ManageStripeSubscriptionPayment({...d,
    getRenewalRecoveryDetails: (value, loaded) => recovery.getDetails(value, loaded)});
  f.read = () => loadStripeSubscriptionPaymentDetails({input, cancellation, management});
  return Object.assign(f, {student, d, recovery, cancellation, management});
}
test("paid status lookup verifies ownership and retrieves its Stripe subscription only once", async () => {
  const f = setup(), details = await f.read();
  assert.equal(details.subscriptionStatus, "active");
  assert.equal(details.paymentState, "paid");
  assert.equal(details.canCancelSubscription, true);
  assert.equal(f.state.calls.filter(call => call[0] === "subscription").length, 1);
  assert.equal(f.state.charges, 0);
});
test("a cancellation that arrives during the lookup is rechecked before returning payment actions", async () => {
  const f = setup();
  f.concurrentCancellation = {mode: "test", subscriptionReference: "sub_owner", state: "cancelled",
    requestedAt: new Date(), cancelledAt: new Date(), accessUntil: f.student.activeUntil};
  const details = await f.read();
  assert.equal(details.subscriptionStatus, "canceled");
  assert.equal(details.canCancelSubscription, false);
  assert.equal(details.canChangeCard, false);
  assert.equal(details.nextChargeAt, null);
  assert.equal(f.state.charges, 0);
});
test("status lookup rejects another account before reading Stripe", async () => {
  const f = setup(); f.state.owner = false;
  await assert.rejects(() => f.read(), {code: "not-found"});
  assert.equal(f.state.calls.length, 0);
});
test("paid recovery refreshes the shared scope before reporting cancellation and access", async () => {
  const f = setup(); let first = true;
  f.management.dependencies.observeRecoveredPayment = async () => {
    if (!first) return null;
    first = false;
    f.state.subscription.status = "trialing";
    f.student.activeUntil = new Date("2031-01-01T00:00:00Z");
    return {outcome: "restarted"};
  };
  const details = await f.read();
  assert.equal(details.subscriptionStatus, "trialing");
  assert.equal(details.accessUntil, "2031-01-01T00:00:00.000Z");
  assert.ok(f.state.calls.filter(call => call[0] === "subscription").length > 1);
  assert.equal(f.state.charges, 0);
});

test("checking a cancellation record uses a document read without starting a transaction", async () => {
  const memory = makeTransactionalFirestore();
  const repository = new FirestoreSubscriptionCancellationRepository({...memory.dependencies,
    getFirestoreDb() {assert.fail("A status check must not start a transaction");}});
  const scope = {studentId: "student", mode: "test", subscriptionReference: "sub_owner"};
  assert.equal(await repository.get(scope), null);
  memory.put(repository.refs(scope).request.path, {state: "pending", requestedAt: new Date("2030-01-01Z")});
  assert.equal((await repository.get(scope)).state, "pending");
});
