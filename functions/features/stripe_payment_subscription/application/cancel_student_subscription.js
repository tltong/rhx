const {loadOwnedStripeSubscription, paymentError} = require("./load_owned_subscription_invoice");
const {projection, accessEnd} = require("../../syllabus_subscription/domain/subscription_cancellation");
const iso = value => JSON.parse(JSON.stringify(value));
const {withMetadata, metadata} = require("../../syllabus_subscription/domain/subscription_payment_view");
const unfinished = e => e.attempt && !["failed", "cancelled", "completed"].includes(e.attempt.state);
class CancelStudentSubscription {
  constructor(dependencies) {this.d = dependencies; this.repo = dependencies.repository;}
  async owned(input) {return loadOwnedStripeSubscription(this.d, input);}
  async command(input) {
    const owned = await this.owned(input);
    const link = await this.d.getGuardianStudentLink({guardianId: owned.internalReference, studentId: owned.record.studentId});
    if (!(link?.isActive || link?.state === "active")) throw paymentError("permission-denied", "Choose a currently linked student.");
    // Observe a genuinely failed renewal even if its webhook is late. This
    // establishes its original grace deadline without starting another payment.
    if (this.d.recovery?.owned) await this.d.recovery.owned(input);
    const request = await this.repo.begin({studentId: owned.record.studentId, mode: owned.mode,
      subscriptionReference: owned.subscriptionReference, customerReference: owned.customer.customerReference, guardianId: owned.internalReference});
    await this.run(request);
  }
  async run(input) {
    const r = await this.repo.claim(input);
    if (!r) return;
    let cancelled = false;
    try {
      if (r.episodeReference) {
        const identity = {studentId: r.studentId, id: r.episodeReference};
        let e = await this.d.episodeRepository.get(identity);
        if (e && e.state !== "completed") {
          await this.d.recovery.run(identity, {action: "cancel_renewal"});
          e = await this.d.episodeRepository.get(identity);
          if (e.leaseToken || unfinished(e) || e.state !== "completed" && !e.cancelledAt) return;
        }
      }
      const {paymentProvider} = await this.d.createPaymentProviderForContext({providerName: "stripe", mode: r.mode});
      if (this.d.reconcileLegacyPaid && !await this.d.reconcileLegacyPaid(r)) return;
      const result = await paymentProvider.cancelSubscriptionNow(r);
      if (result.cancelled && this.d.observeFinalInvoice) await this.d.observeFinalInvoice(r);
      cancelled = result.cancelled;
    } finally {await this.repo.finish(r, cancelled); if (this.d.onChanged) await this.d.onChanged(r);}
  }
  async requestFor(owned) {
    return this.repo.get({studentId: owned.record.studentId, mode: owned.mode, subscriptionReference: owned.subscriptionReference});
  }
  async reconcile(input) {
    const owned = await this.owned(input), r = await this.requestFor(owned);
    if (r?.state === "pending") {
      await this.run(r);
      return this.owned(input); // A confirmed cancellation can change Stripe and access state.
    }
    return owned;
  }
  async requirePaymentAllowed(input) {
    const owned = await this.owned(input);
    if (await this.requestFor(owned)) throw paymentError("failed-precondition", "This subscription has been cancelled or cancellation is being confirmed.");
  }
  async decorate(input, details, loaded = null) {
    const owned = loaded || await this.owned(input), r = await this.requestFor(owned);
    return withMetadata({...details, canCancelSubscription: !["canceled", "incomplete_expired"].includes(owned.subscription.status) && !r,
      accessUntil: accessEnd(owned.student || {}, owned.mode, owned.subscriptionReference)?.toISOString() || null,
      ...(r ? {subscriptionStatus: r.state === "cancelled" ? "canceled" : details.subscriptionStatus,
        cancellation: iso(projection(r)), canChangeCard: false, canChangeAllStudents: false,
        canCancelRenewal: false, canCancelPendingPayment: false, nextChargeAt: null,
        renewal: details.renewal ? {...details.renewal, action: "unavailable", canRetry: false, canPayWithNewCard: false, paymentClientSecret: null} : null} : {})}, details[metadata]?.subscription || owned.subscription);
  }
  async execute(input = {}) {
    const rows = await this.repo.listDue(input); let errors = 0;
    const deadline = input.deadline || Date.now() + 30000;
    let examined = 0;
    for (const row of rows) {if (Date.now() >= deadline) break; try {
      examined++;
      if (row.state === "cancelled") await this.repo.expire(row);
      else await this.run(row);
    } catch {errors++;}}
    return {examined, errors};
  }
}
module.exports = {CancelStudentSubscription};
