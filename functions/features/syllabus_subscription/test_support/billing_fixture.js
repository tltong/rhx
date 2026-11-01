const {makeTransactionalFirestore} = require("../../stripe_customer/test_support/transactional_firestore");
const {FirestoreSubscriptionBillingRepository, invoiceKey} = require("../infrastructure/firestore_subscription_billing_repository");
const {ManageSubscriptionBilling} = require("../application/manage_subscription_billing");
const NOW = new Date("2026-10-01T00:00:00Z");
const END = new Date("2026-11-01T00:00:00Z");
function makeBillingFixture() {
  const memory = makeTransactionalFirestore();
  memory.put("subscriptions/student-a", {subscriptionType: "trial", activeUntil: new Date("2026-10-05T00:00:00Z"),
    paymentProvider: null, paymentMode: null, paymentCustomerReference: null,
    paymentSubscriptionReference: null, planId: null,
    createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z")});
  const fixture = {memory, now: NOW};
  const query = path => {
    const state = {start: null, after: null, end: null, limit: null};
    const q = {orderBy() {return q;}, startAt(v) {state.start = v; return q;}, startAfter(v) {state.after = v; return q;},
      endBefore(v) {state.end = v; return q;}, limit(v) {state.limit = v; return q;}, async get() {
        const docs = [...memory.store.entries()].filter(([key]) => key.startsWith(path + "/"))
          .map(([key, data]) => ({id: key.slice(path.length + 1), data: () => structuredClone(data)}))
          .filter(d => (!state.start || d.id >= state.start) && (!state.after || d.id > state.after)
            && (!state.end || d.id < state.end)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, state.limit);
        return {docs};
      }};
    return q;
  };
  const repository = new FirestoreSubscriptionBillingRepository({...memory.dependencies, getCollectionRef: query});
  fixture.billing = new ManageSubscriptionBilling({repository, now: () => fixture.now});
  fixture.repository = repository;
  fixture.scope = {studentId: "student-a", paymentProvider: "stripe", paymentMode: "prod", paymentSubscriptionReference: "sub_one"};
  fixture.invoice = {invoiceReference: "in_initial", paymentCustomerReference: "cus_one", guardianId: "guardian-a", planId: "monthly",
    billingReason: "subscription_create", subscriptionStatus: "incomplete", invoiceStatus: "open",
    paymentIntentReference: "pi_one", paymentIntentStatus: "requires_confirmation", paymentState: "unpaid",
    amountDue: 2500, amountPaid: 0, amountRemaining: 2500, currency: "myr", currencyExponent: 2,
    invoiceCreatedAt: NOW, subscriptionRegisteredAt: NOW, observedAt: NOW,
    billingPeriodStart: NOW, billingPeriodEnd: END, durationMonths: 1, attemptCount: 0,
    nextPaymentAttemptAt: null, failureCode: null, lastFailedAt: null, paidAt: null, isLatestInvoice: true};
  fixture.input = (changes = {}, scopeChanges = {}) => ({...fixture.scope, ...scopeChanges,
    invoiceRecord: {...fixture.invoice, ...changes}});
  fixture.event = (changes = {}, scopeChanges = {}, eventReference = "evt_one") => fixture.billing.recordInvoicePaymentEvent({
    ...fixture.input(changes, scopeChanges), eventReference, eventType: "invoice.updated", eventCreatedAt: fixture.now});
  fixture.paid = (changes = {}, scopeChanges = {}, eventReference = "evt_paid") => fixture.event({
    paymentState: "paid", invoiceStatus: "paid", paymentIntentStatus: "succeeded", subscriptionStatus: "active",
    amountPaid: 2500, amountRemaining: 0, paidAt: NOW, attemptCount: 1, ...changes}, scopeChanges, eventReference);
  fixture.student = () => structuredClone(memory.store.get("subscriptions/student-a"));
  fixture.read = (reference = "in_initial", scopeChanges = {}) => fixture.billing.getInvoiceRecord({...fixture.scope, ...scopeChanges, invoiceReference: reference});
  fixture.receipts = () => [...memory.store.entries()].filter(([key]) => key.startsWith("subscriptions/student-a/payments/"));
  fixture.invoicePath = (ref = "in_initial", scopeChanges = {}) => "subscriptions/student-a/invoices/" + invoiceKey({...fixture.scope, ...scopeChanges}, ref);
  return fixture;
}
module.exports = {makeBillingFixture, NOW, END};
