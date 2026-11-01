const {randomUUID, createHash} = require("node:crypto");
const {invoiceRecord} = require("./stripe_invoice_record");

class ReconcileRenewalRecovery {
  constructor(dependencies) {this.dependencies = dependencies; this.now = dependencies.now || (() => new Date());}

  async initializeLegacy(owned) {
    const {record: registered, customer, subscription, mode, paymentProvider} = owned;
    const invoiceReference = owned.context?.invoiceReference || owned.selectedInvoiceReference;
    if (!invoiceReference) return null;
    const identity = {studentId: registered.studentId, paymentProvider: "stripe", paymentMode: mode,
      paymentSubscriptionReference: subscription.subscriptionReference, invoiceReference};
    const stored = await this.dependencies.getInvoiceRecord(identity);
    if (stored?.renewalRecovery || stored?.paymentState === "paid" || (stored && stored.billingReason !== "subscription_cycle")) return null;
    const context = await paymentProvider.retrieveInvoicePaymentContext(invoiceReference, {includeBillingDetails: true});
    if (context.customerReference !== customer.customerReference || context.subscriptionReference !== subscription.subscriptionReference) {
      throw Error("Unexpected legacy recovery owner.");
    }
    if (context.billingReason !== "subscription_cycle") return null;
    const failed = stored?.renewalRetry || stored?.lastFailedAt || (context.paymentAttempted
      && (context.failureCode || ["past_due", "unpaid"].includes(subscription.status)
        || context.paymentStatus === "requires_action" || context.attemptCount > 1));
    if (!failed) return null;
    const plan = stored?.renewalRetry, now = this.now();
    const policy = plan ? {maxRetries: plan.maxRetries, intervalHours: plan.intervalHours,
      gracePeriodHours: Math.max(1, Math.min(1680, Math.ceil((plan.graceUntil - plan.firstFailedAt) / 3600000)))}
      : (await this.dependencies.getPaymentConfig?.())?.renewalRetryPolicy;
    if (!policy?.gracePeriodHours) return null;
    const firstFailedAt = plan?.firstFailedAt || stored?.lastFailedAt || context.invoiceCreatedAt;
    await this.dependencies.recordInvoicePaymentEvent({...identity,
      eventReference: "recovery_upgrade_" + createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
      eventType: "backend.renewal_recovery.initialize", eventCreatedAt: firstFailedAt,
      renewalRetryPolicy: policy,
      invoiceRecord: invoiceRecord({context, subscription, registered, customer, observedAt: now,
        selectedInvoiceReference: invoiceReference})});
    return this.process(identity);
  }

  async recordPaid(owned) {
    const {record: registered, customer, subscription, mode, paymentProvider} = owned;
    const invoiceReference = owned.context.invoiceReference;
    const identity = {studentId: registered.studentId, paymentProvider: "stripe", paymentMode: mode,
      paymentSubscriptionReference: subscription.subscriptionReference, invoiceReference};
    const stored = await this.dependencies.getInvoiceRecord(identity);
    if (!stored?.renewalRecovery || stored.renewalRecovery.state === "completed") return null;
    const context = await paymentProvider.retrieveInvoicePaymentContext(invoiceReference, {includeBillingDetails: true});
    if (context.invoiceReference !== invoiceReference || context.subscriptionReference !== identity.paymentSubscriptionReference
      || context.customerReference !== customer.customerReference || context.invoiceStatus !== "paid") throw Error("Unverified invoice settlement.");
    const now = this.now();
    await this.dependencies.recordInvoicePaymentEvent({...identity,
      eventReference: "recovery_paid_" + createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
      eventType: "backend.renewal_recovery.payment_verified", eventCreatedAt: now,
      invoiceRecord: invoiceRecord({context, subscription, registered, customer, observedAt: now,
        selectedInvoiceReference: invoiceReference})});
    return this.process(identity);
  }

  async process(input) {
    const dependencies = this.dependencies, leaseToken = randomUUID();
    const identity = {...input, leaseToken};
    const invoice = await dependencies.claimRenewalRecovery(identity);
    if (!invoice || invoice.renewalRecovery.leaseToken !== leaseToken) return {outcome: "skipped"};
    const finish = outcome => dependencies.finishRenewalRecovery({...identity, outcome});
    try {
      if (invoice.renewalRecovery.state === "manual_review") {await finish("manual_review"); return {outcome: "manual_review"};}
      const {paymentProvider} = await dependencies.createPaymentProviderForContext({providerName: "stripe", mode: invoice.paymentMode});
      const [customer, registered] = await Promise.all([
        dependencies.getCustomerRecordByInternalReference({mode: invoice.paymentMode, internalReference: invoice.guardianId}),
        dependencies.getSubscriptionRecord({mode: invoice.paymentMode, customerReference: invoice.paymentCustomerReference,
          subscriptionReference: invoice.paymentSubscriptionReference})]);
      if (!customer || customer.customerReference !== invoice.paymentCustomerReference
        || !registered || registered.studentId !== invoice.studentId
        || !require("./billing_plan_version").supportsInvoicePlan(registered, invoice)) {
        await finish("manual_review"); return {outcome: "manual_review"};
      }
      const subscription = await paymentProvider.retrieveSubscription(invoice.paymentSubscriptionReference, {includeRecoveryDetails: true});
      if (subscription.customerReference !== invoice.paymentCustomerReference) throw Error("Unexpected recovery customer.");
      const load = () => paymentProvider.retrieveInvoicePaymentContext(invoice.invoiceReference, {includeBillingDetails: true});
      let context = await load();
      const verify = () => {
        if (context.invoiceReference !== invoice.invoiceReference || context.customerReference !== invoice.paymentCustomerReference
          || context.subscriptionReference !== invoice.paymentSubscriptionReference) throw Error("Unexpected recovery invoice.");
      };
      verify();
      if (context.invoiceStatus !== "paid") {
        await paymentProvider.holdRenewalBilling({subscriptionReference: invoice.paymentSubscriptionReference, invoiceReference: invoice.invoiceReference});
        context = await load(); verify();
        if (context.invoiceStatus !== "paid") {
          await finish("held"); return {outcome: "held"};
        }
      }
      // Record settlement before the provider operation. If restarting fails,
      // the durable recovery task survives and access remains suspended.
      const now = this.now();
      await dependencies.recordInvoicePaymentEvent({...input,
        eventReference: "recovery_observed_paid_" + createHash("sha256").update(JSON.stringify([
          invoice.paymentMode, invoice.paymentSubscriptionReference, invoice.invoiceReference])).digest("hex"),
        eventType: "backend.renewal_recovery.payment_verified", eventCreatedAt: now,
        invoiceRecord: invoiceRecord({context, subscription, registered, customer, observedAt: now,
          selectedInvoiceReference: invoice.invoiceReference})});
      const paid = await dependencies.getInvoiceRecord(input);
      await paymentProvider.restartRenewalBilling({subscriptionReference: invoice.paymentSubscriptionReference,
        invoiceReference: invoice.invoiceReference, paidAt: paid.renewalRecovery.paidAt,
        paidThrough: paid.renewalRecovery.paidThrough, now});
      await finish("restarted"); return {outcome: "restarted"};
    } catch (error) {
      const review = ["failed-precondition", "not-found", "resource_missing"].includes(error?.code) || error?.type === "StripeInvalidRequestError";
      await finish(review ? "manual_review" : "error");
      return {outcome: review ? "manual_review" : "error"};
    }
  }
  async execute({limit = 25, deadline = Date.now() + 90000} = {}) {
    const jobs = await this.dependencies.listDueRenewalRecoveries({limit});
    const result = {examined: 0, restarted: 0, held: 0, errors: 0};
    for (const input of jobs) {
      if (Date.now() >= deadline) break;
      const {outcome} = await this.process(input); result.examined++;
      if (this.dependencies.onChanged) await this.dependencies.onChanged(input);
      if (outcome === "restarted") result.restarted++;
      else if (outcome === "held") result.held++;
      else if (outcome === "error" || outcome === "manual_review") result.errors++;
    }
    return result;
  }
}
module.exports = {ReconcileRenewalRecovery};
