const assert = require("node:assert/strict");
const {makeStripeWebhookFixture, END, unix} = require("./stripe_webhook_fixture");
const {PaymentConfig} = require("../../payment/domain/payment_config");
const {FirestoreRenewalRetryRepository} = require("../../syllabus_subscription/infrastructure/firestore_renewal_retry_repository");
const {FirestoreStudentSubscriptionRepository} = require("../../syllabus_subscription/infrastructure/firestore_student_subscription_repository");
const {ProcessDueRenewalRetries} = require("../application/process_due_renewal_retries");
const {ManageStripeSubscriptionPayment} = require("../application/manage_stripe_subscription_payment");

async function makeRenewalRetryFixture({mode = "prod", maxRetries = 3, intervalHours = 1} = {}) {
  const f = await makeStripeWebhookFixture({mode});
  f.pay(); await f.process(f.event("invoice.paid"));
  const paidThrough = f.student().activeUntil;
  f.now = END;
  Object.assign(f.state.invoice, {id: "in_renewal", billing_reason: "subscription_cycle", created: unix(END),
    status: "open", amount_paid: 0, amount_remaining: 2500, status_transitions: {paid_at: null},
    auto_advance: true, attempt_count: 0});
  f.state.invoice.lines.data[0].period = {start: unix(END), end: unix(new Date("2026-12-01Z"))};
  Object.assign(f.state.subscription, {latest_invoice: "in_renewal", current_period_start: unix(END), current_period_end: unix(new Date("2026-12-01Z"))});
  f.fail();
  f.policy = {maxRetries, intervalHours};
  f.state.behavior = "decline";
  f.state.paymentCalls = []; f.state.controlCalls = []; f.state.actualAttempts = 0;
  const responses = new Map();
  f.stripe.stripeClient.invoices.update = async (id, input) => {
    f.state.controlCalls.push({id, input});
    if (f.state.controlError) throw Error("Control request failed");
    assert.equal(id, f.state.invoice.id); assert.deepEqual(input, {auto_advance: false});
    f.state.invoice.auto_advance = false;
    return structuredClone(f.state.invoice);
  };
  f.stripe.stripeClient.invoices.pay = async (id, input, options) => {
    f.state.paymentCalls.push({id, input, options});
    assert.equal(id, f.state.invoice.id);
    assert.equal(f.state.invoice.auto_advance, false, "Backend must own automatic collection before charging");
    if (responses.has(options.idempotencyKey)) return responses.get(options.idempotencyKey);
    if (f.state.behavior === "transport-before-request") {
      f.state.behavior = "paid";
      throw Object.assign(Error("Request did not reach Stripe"), {type: "StripeConnectionError"});
    }
    const response = (async () => {
      await f.state.paymentGate?.();
      f.state.actualAttempts++;
      if (f.state.behavior === "decline") {
        f.fail();
        throw Object.assign(Error("Declined"), {type: "StripeCardError", decline_code: "insufficient_funds"});
      }
      if (f.state.behavior === "authentication") {
        f.state.intent.status = "requires_action";
        throw Object.assign(Error("Authentication required"), {type: "StripeCardError"});
      }
      if (f.state.behavior === "processing") {f.state.intent.status = "processing"; return structuredClone(f.state.invoice);}
      f.pay();
      if (f.state.behavior === "lost-response") throw Object.assign(Error("Lost paid response"), {type: "StripeConnectionError"});
      return structuredClone(f.state.invoice);
    })();
    responses.set(options.idempotencyKey, response);
    return response;
  };
  f.processor.getPaymentConfig = async () => new PaymentConfig({provider: "stripe", mode: "test", renewalRetryPolicy: f.policy});
  const retries = new FirestoreRenewalRetryRepository({...f.memory.dependencies, now: () => f.now});
  const students = new FirestoreStudentSubscriptionRepository(f.memory.dependencies);
  const dependencies = {
    createPaymentProviderForContext: async input => {
      assert.deepEqual(input, {providerName: "stripe", mode});
      return {providerName: "stripe", mode, paymentProvider: f.stripe};
    },
    getCustomerRecordByInternalReference: input => f.records.getCustomerRecordByInternalReference(input),
    getSubscriptionRecord: input => f.records.getSubscriptionRecord(input),
    listDueRenewalRetries: input => retries.listDueRenewalRetries(input),
    claimRenewalRetry: input => retries.claimRenewalRetry(input),
    beginRenewalRetryAttempt: input => retries.beginRenewalRetryAttempt(input),
    finishRenewalRetry: input => retries.finishRenewalRetry(input),
    recordInvoicePaymentEvent: input => f.billing.recordInvoicePaymentEvent(input),
    now: () => f.now,
  };
  const worker = new ProcessDueRenewalRetries(dependencies);
  const manager = new ManageStripeSubscriptionPayment({
    ...dependencies, createPaymentProviderContext: () => dependencies.createPaymentProviderForContext({providerName: "stripe", mode}),
    getStudentSubscription: id => students.getSubscription(id), getInvoiceRecord: input => f.billing.getInvoiceRecord(input),
  });
  const scope = {...f.scope, invoiceReference: "in_renewal"};
  return Object.assign(f, {paidThrough, retries, dependencies, worker, manager, retryScope: scope,
    plan: async () => (await f.read("in_renewal"))?.renewalRetry,
    advance: hours => {f.now = new Date(f.now.getTime() + hours * 3600000);},
    seed: () => f.deliver(f.event("invoice.payment_failed"))});
}
module.exports = {makeRenewalRetryFixture};
