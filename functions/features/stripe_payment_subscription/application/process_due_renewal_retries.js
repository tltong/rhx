const {randomUUID, createHash} = require("node:crypto");
const {loadOwnedSubscriptionInvoice, recoveryResult} = require("./load_owned_subscription_invoice");
const {invoiceRecord} = require("./stripe_invoice_record");
const {REPLAY_LIMIT} = require("../../syllabus_subscription/domain/renewal_retry");

class ProcessDueRenewalRetries {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now || (() => new Date());
    this.token = dependencies.leaseTokenFactory || randomUUID;
  }
  async execute({limit = 25, deadline = Date.now() + 90000} = {}) {
    const jobs = await this.dependencies.listDueRenewalRetries({limit});
    const counts = {examined: 0, paid: 0, attempted: 0, deferred: 0, skipped: 0, errors: 0};
    for (const job of jobs) {
      if (Date.now() >= deadline) break; // Leave unclaimed work for the next sweep.
      counts.examined++;
      try {
        const result = await this.process(job);
        if (result.attempted) counts.attempted++;
        if (result.outcome === "paid") counts.paid++;
        else if (result.outcome === "error") counts.errors++;
        else if (result.outcome === "skipped") counts.skipped++;
        else counts.deferred++;
      } catch {counts.errors++;} // An expired lease makes an interrupted job recoverable.
      finally {if (this.dependencies.onChanged) await this.dependencies.onChanged(job);}
    }
    return counts;
  }
  async process(job) {
    const dependencies = this.dependencies;
    const leaseToken = this.token();
    const identity = {...job, leaseToken};
    let claimed = await dependencies.claimRenewalRetry(identity);
    if (!claimed || claimed.renewalRetry.state !== "leased" || claimed.renewalRetry.leaseToken !== leaseToken) {
      return {outcome: "skipped"};
    }
    const finish = (outcome, reason, extra = {}) => dependencies.finishRenewalRetry({...identity, outcome, reason, ...extra});
    let attempted = false;
    try {
      if (claimed.paymentProvider !== "stripe") throw Error("Unexpected renewal payment provider.");
      // A stored production invoice must keep using production credentials even
      // when the administrator switches the default mode to test.
      const provider = await dependencies.createPaymentProviderForContext({providerName: "stripe", mode: claimed.paymentMode});
      const reads = {...dependencies, createPaymentProviderContext: async () => provider};
      const input = {internalReference: claimed.guardianId,
        subscriptionReference: claimed.paymentSubscriptionReference, invoiceReference: claimed.invoiceReference};
      const load = () => loadOwnedSubscriptionInvoice(reads, input);
      let current = await load();
      if (dependencies.ensureRenewalRecovery) {
        const upgrade = await dependencies.ensureRenewalRecovery(current);
        if (upgrade?.outcome === "error" || upgrade?.outcome === "manual_review") {
          await finish("error", "billing_hold_pending"); return {outcome: "error"};
        }
        if (upgrade) {
          current = await load();
          const refreshed = await dependencies.getInvoiceRecord?.(job);
          if (refreshed?.renewalRetry?.leaseToken === leaseToken) claimed = refreshed;
        }
      }
      if (current.record.studentId !== claimed.studentId || current.record.planId !== claimed.planId
        || current.context.customerReference !== claimed.paymentCustomerReference) throw Error("Unexpected renewal ownership.");
      const paid = async loaded => {
        const context = await loaded.paymentProvider.retrieveInvoicePaymentContext(claimed.invoiceReference, {includeBillingDetails: true});
        if (context.invoiceReference !== claimed.invoiceReference || context.customerReference !== claimed.paymentCustomerReference
          || context.subscriptionReference !== claimed.paymentSubscriptionReference || context.invoiceStatus !== "paid") {
          throw Error("Invoice settlement is not confirmed.");
        }
        const now = this.now();
        const eventReference = "backend_retry_paid_" + createHash("sha256")
          .update(JSON.stringify([claimed.paymentMode, claimed.paymentSubscriptionReference, claimed.invoiceReference])).digest("hex");
        await dependencies.recordInvoicePaymentEvent({studentId: claimed.studentId, paymentProvider: "stripe",
          paymentMode: claimed.paymentMode, paymentSubscriptionReference: claimed.paymentSubscriptionReference,
          eventReference, eventType: "backend.renewal_retry.payment_verified", eventCreatedAt: now,
          invoiceRecord: invoiceRecord({context, subscription: loaded.subscription, registered: loaded.record,
            customer: loaded.customer, observedAt: now, selectedInvoiceReference: loaded.selectedInvoiceReference})});
        if (dependencies.reconcileRenewalRecovery) await dependencies.reconcileRenewalRecovery({...job});
        return {outcome: "paid", attempted};
      };
      let action = recoveryResult(current);
      if (action.action === "complete") return await paid(current);
      if (action.action === "wait" || (current.context.invoiceStatus === "open" && current.context.amountRemaining === 0)) {
        await finish("processing", "payment_processing"); return {outcome: "processing"};
      }
      if (!current.eligible || current.context.billingReason !== "subscription_cycle") {
        await finish("stopped", "invoice_no_longer_recoverable"); return {outcome: "stopped"};
      }
      if (action.action === "confirm_payment" || !action.canRetry) {
        await finish("awaiting_action", action.action === "confirm_payment" ? "authentication_required" : "payment_method_required");
        return {outcome: "awaiting_action"};
      }
      if (claimed.renewalRecovery && !["held", "suspended"].includes(claimed.renewalRecovery.state)) {
        await finish("error", "billing_hold_pending"); return {outcome: "error"};
      }
      let plan = claimed.renewalRetry;
      const now = this.now();
      if (plan.attemptReference) {
        if (now.getTime() - plan.attemptStartedAt.getTime() > REPLAY_LIMIT
          || plan.attemptPaymentMethodReference !== current.paymentMethodReference) {
          // Never reuse an expired Stripe idempotency key or replay an old card
          // after the guardian selected a different subscription default.
          await finish("failed", "uncertain_attempt_closed"); return {outcome: "deferred"};
        }
      } else {
        if (plan.attemptsMade >= plan.maxRetries || (plan.gracePeriodHours !== undefined && now >= plan.graceUntil
          && (!plan.nextAttemptAt || plan.nextAttemptAt > plan.graceUntil
            || now.getTime() > plan.graceUntil.getTime() + 10 * 60000))
          || (!plan.nextAttemptAt && now >= plan.graceUntil)) {
          await finish("exhausted", "retry_period_ended"); return {outcome: "exhausted"};
        }
        const earliest = new Date((plan.lastAttemptAt || plan.firstFailedAt).getTime() + plan.intervalHours * 3600000);
        if (now < earliest) {
          await finish("defer", "interval_not_elapsed", {nextAttemptAt: earliest}); return {outcome: "deferred"};
        }
        const reserved = await dependencies.beginRenewalRetryAttempt({...identity,
          paymentMethodReference: current.paymentMethodReference});
        if (!reserved) return {outcome: "skipped"};
        plan = reserved.renewalRetry;
      }
      // Check collection control again in case an administrator re-enabled it.
      if (current.context.autoAdvance) await current.paymentProvider.disableInvoiceAutomaticCollection(claimed.invoiceReference);
      let failure = null;
      attempted = true;
      try {
        await current.paymentProvider.payInvoice({invoiceReference: claimed.invoiceReference,
          paymentMethodReference: plan.attemptPaymentMethodReference,
          idempotencyReference: plan.attemptReference, offSession: true});
      } catch (error) {failure = error;}
      current = await load();
      action = recoveryResult(current);
      if (action.action === "complete") return await paid(current);
      if (action.action === "wait") {
        await finish("processing", "payment_processing"); return {outcome: "processing", attempted};
      }
      if (action.action === "confirm_payment") {
        await finish("awaiting_action", "authentication_required"); return {outcome: "awaiting_action", attempted};
      }
      if (failure && failure.type !== "StripeCardError" && failure.rawType !== "card_error") {
        // The attempt remains reserved. A later worker reads Stripe and, if
        // necessary, replays exactly the same idempotency key and method.
        await finish("error", "payment_result_unknown"); return {outcome: "error", attempted};
      }
      await finish("failed", "payment_failed");
      return {outcome: "failed", attempted};
    } catch (error) {
      const unavailable = ["not-found", "permission-denied", "failed-precondition"].includes(error?.code);
      await finish(unavailable ? "stopped" : "error", unavailable ? "subscription_unavailable" : "retry_service_unavailable");
      return {outcome: unavailable ? "stopped" : "error", attempted};
    }
  }
}
module.exports = {ProcessDueRenewalRetries};
