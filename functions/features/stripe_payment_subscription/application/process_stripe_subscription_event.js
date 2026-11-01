const {selectedSubscriptionInvoice} = require("./load_owned_subscription_invoice");
const {invoiceRecord} = require("./stripe_invoice_record");
const STRIPE_SUBSCRIPTION_EVENT_TYPES = Object.freeze({
  INVOICE_PAID: "invoice.paid",
  INVOICE_PAYMENT_FAILED: "invoice.payment_failed",
  INVOICE_PAYMENT_ACTION_REQUIRED: "invoice.payment_action_required",
  INVOICE_UPDATED: "invoice.updated",
  SUBSCRIPTION_UPDATED: "customer.subscription.updated",
  SUBSCRIPTION_DELETED: "customer.subscription.deleted",
});
const SUPPORTED_EVENT_TYPES = new Set(Object.values(STRIPE_SUBSCRIPTION_EVENT_TYPES));
function ref(value) {return typeof value === "object" ? value?.id || null : value || null;}
function normalizeInvoiceEvent(event) {
  const value = event?.data?.object;
  if (!value || value.object !== "invoice" || !value.id || !ref(value.customer)) {
    throw Error("Stripe event must contain an Invoice object with its customer.");
  }
  return Object.freeze({invoiceReference: value.id, customerReference: ref(value.customer),
    subscriptionReference: ref(value.parent?.subscription_details?.subscription || value.subscription)});
}
function verify(context, identity) {
  if (context.invoiceReference !== identity.invoiceReference
    || context.customerReference !== identity.customerReference
    || context.subscriptionReference !== identity.subscriptionReference) {
    throw Error("Stripe Invoice payment context does not match event ownership.");
  }
}
class ProcessStripeSubscriptionEvent {
  constructor({createStripePayment, getSubscriptionRecord, getCustomerRecordByReference,
    recordInvoicePaymentEvent, writePaymentMethodRecord = null, getPaymentConfig = null, getStudentSubscription = null, getInvoiceRecord = null, reconcileRenewalRecovery = null, now = () => new Date()}) {
    Object.assign(this, {createStripePayment, getSubscriptionRecord, getCustomerRecordByReference,
      recordInvoicePaymentEvent, writePaymentMethodRecord, getPaymentConfig, getStudentSubscription, getInvoiceRecord, reconcileRenewalRecovery, now});
  }
  async execute({mode, event} = {}) {
    if (!["test", "prod"].includes(mode)) throw Error("mode must be test or prod.");
    const eventType = event?.type;
    if (!eventType) throw Error("A Stripe event is required.");
    if (!SUPPORTED_EVENT_TYPES.has(eventType)) return {handled: false, eventType};
    if (typeof event.livemode === "boolean" && event.livemode !== (mode === "prod")) {
      throw Error("Stripe event mode does not match this endpoint.");
    }
    if (!event.id || !Number.isSafeInteger(event.created) || event.created < 0) throw Error("Stripe event identity and timestamp are required.");
    const eventCreatedAt = new Date(event.created * 1000), observedAt = this.now();
    let identity;
    if (eventType.startsWith("customer.subscription.")) {
      const value = event.data?.object;
      if (value?.object !== "subscription" || !value.id || !ref(value.customer)) throw Error("Invalid subscription event.");
      identity = {subscriptionReference: value.id, customerReference: ref(value.customer), invoiceReference: ref(value.latest_invoice)};
    } else identity = normalizeInvoiceEvent(event);
    if (!identity.subscriptionReference) return {handled: false, eventType, mode, invoiceReference: identity.invoiceReference};
    const payment = this.createStripePayment({mode});
    const [registered, customer] = await Promise.all([
      this.getSubscriptionRecord({mode, customerReference: identity.customerReference, subscriptionReference: identity.subscriptionReference}),
      this.getCustomerRecordByReference({mode, customerReference: identity.customerReference}),
    ]);
    if (!registered || !customer) throw Error("Stripe subscription/customer is not registered yet.");
    if (!registered.studentId || !registered.planId) return {handled: false, eventType, reason: "unmapped_subscription"};
    const subscription = await payment.retrieveSubscription(identity.subscriptionReference, {includeRecoveryDetails: true});
    if (subscription.subscriptionReference !== identity.subscriptionReference
      || subscription.customerReference !== identity.customerReference) throw Error("Stripe subscription customer does not match event.");
    const student = this.getStudentSubscription ? await this.getStudentSubscription(registered.studentId) : null;
    const selectedInvoiceReference = await selectedSubscriptionInvoice({subscription, student, mode, paymentProvider: payment});
    if (!identity.invoiceReference || eventType.startsWith("customer.subscription.")) {
      identity.invoiceReference = selectedInvoiceReference;
    }
    if (!identity.invoiceReference) return {handled: true, eventType, reason: "no_invoice"};
    const context = await payment.retrieveInvoicePaymentContext(identity.invoiceReference, {includeBillingDetails: true});
    verify(context, identity);
    const record = invoiceRecord({context, subscription, registered, customer, observedAt, eventType, eventCreatedAt, selectedInvoiceReference});
    let renewalRetryPolicy;
    if (this.getInvoiceRecord && this.reconcileRenewalRecovery && record.billingReason === "subscription_cycle") {
      const stored = await this.getInvoiceRecord({studentId: registered.studentId, paymentProvider: "stripe", paymentMode: mode,
        paymentSubscriptionReference: identity.subscriptionReference, invoiceReference: identity.invoiceReference});
      if ((stored?.renewalRetry || stored?.lastFailedAt) && !stored.renewalRecovery && stored.paymentState !== "paid") {
        const plan = stored.renewalRetry;
        renewalRetryPolicy = plan ? {maxRetries: plan.maxRetries, intervalHours: plan.intervalHours,
          gracePeriodHours: Math.max(1, Math.min(1680, Math.ceil((plan.graceUntil - plan.firstFailedAt) / 3600000)))}
          : (await this.getPaymentConfig?.())?.renewalRetryPolicy;
      }
    }
    if (this.getPaymentConfig && eventType === "invoice.payment_failed"
      && record.billingReason === "subscription_cycle" && record.isLatestInvoice
      && (record.invoiceStatus === "paid" || (record.invoiceStatus === "open" && ["failed", "authentication_required"].includes(record.paymentState)))) {
      const config = await this.getPaymentConfig();
      if (!config?.renewalRetryPolicy) throw Error("Renewal retry configuration is unavailable.");
      // Take collection ownership before committing the retry plan. Failure
      // returns 500 so Stripe redelivers instead of leaving two retry owners.
      if (context.invoiceStatus === "open") await payment.disableInvoiceAutomaticCollection(context.invoiceReference);
      renewalRetryPolicy ||= this.reconcileRenewalRecovery ? config.renewalRetryPolicy
        : {maxRetries: config.renewalRetryPolicy.maxRetries, intervalHours: config.renewalRetryPolicy.intervalHours};
    }
    if (!renewalRetryPolicy && record.paymentState === "paid" && this.getPaymentConfig) {
      const policy = (await this.getPaymentConfig())?.renewalRetryPolicy;
      renewalRetryPolicy = policy && (this.reconcileRenewalRecovery ? policy
        : {maxRetries: policy.maxRetries, intervalHours: policy.intervalHours});
    }
    const outcome = await this.recordInvoicePaymentEvent({studentId: registered.studentId,
      paymentProvider: "stripe", paymentMode: mode, paymentSubscriptionReference: identity.subscriptionReference,
      eventReference: event.id, eventType, eventCreatedAt, invoiceRecord: record,
      ...(renewalRetryPolicy ? {renewalRetryPolicy} : {})});
    let recoveryOutcome;
    if (outcome.invoiceRecord?.renewalRecovery && this.reconcileRenewalRecovery) {
      recoveryOutcome = await this.reconcileRenewalRecovery({studentId: registered.studentId,
        paymentProvider: "stripe", paymentMode: mode, paymentSubscriptionReference: identity.subscriptionReference,
        invoiceReference: identity.invoiceReference});
      if (recoveryOutcome.outcome === "error") throw Error("Renewal billing control is pending reconciliation.");
    }
    // Card metadata is an idempotent projection. If this fails, return 500 and
    // retry it; the committed invoice event safely prevents duplicate receipts.
    if (record.paymentState === "paid" && this.writePaymentMethodRecord && subscription.defaultPaymentMethodReference) {
      const method = await payment.retrievePaymentMethod(subscription.defaultPaymentMethodReference);
      if (method.customerReference !== identity.customerReference
        || method.paymentMethodReference !== subscription.defaultPaymentMethodReference) throw Error("Unexpected subscription card owner.");
      await this.writePaymentMethodRecord({mode, customerReference: identity.customerReference,
        paymentMethodReference: method.paymentMethodReference, type: method.type, status: "attached", card: method.card});
    }
    return {handled: true, eventType, mode, ...identity, status: subscription.status,
      paymentState: outcome.invoiceRecord.paymentState, duplicate: outcome.duplicate,
      accessUpdated: outcome.accessUpdated || recoveryOutcome?.outcome === "restarted", receiptCreated: outcome.receiptCreated || recoveryOutcome?.outcome === "restarted"};
  }
}
module.exports = {ProcessStripeSubscriptionEvent, STRIPE_SUBSCRIPTION_EVENT_TYPES, normalizeInvoiceEvent};
