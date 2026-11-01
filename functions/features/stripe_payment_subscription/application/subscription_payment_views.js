const {loadOwnedStripeSubscription, paymentError, requireStripeReference} = require("./load_owned_subscription_invoice");
const {metadata, iso} = require("../../syllabus_subscription/domain/subscription_payment_view");
class SubscriptionPaymentViews {
  constructor(dependencies) {this.d = dependencies; this.repo = dependencies.repository;}
  async scope(input, modeOverride = null) {
    const config = modeOverride ? {provider: "stripe", mode: modeOverride} : await this.d.getPaymentConfig();
    if (config?.provider !== "stripe") throw paymentError("failed-precondition", "Stripe subscriptions are unavailable.");
    const subscriptionReference = requireStripeReference(input.subscriptionReference, "sub_", "subscriptionReference");
    if (!input.internalReference) throw paymentError("unauthenticated", "Sign in to manage this subscription.");
    const customer = await this.d.getCustomerRecordByInternalReference({mode: config.mode, internalReference: input.internalReference});
    const record = customer && await this.d.getSubscriptionRecord({mode: config.mode, customerReference: customer.customerReference, subscriptionReference});
    if (!record?.studentId) throw paymentError("not-found", "This subscription is unavailable.");
    const link = await this.d.getGuardianStudentLink({guardianId: input.internalReference, studentId: record.studentId});
    if (!(link?.isActive || link?.state === "active")) throw paymentError("permission-denied", "Choose a currently linked student.");
    return {studentId: record.studentId, guardianId: input.internalReference, customerReference: customer.customerReference,
      subscriptionReference, mode: config.mode, record};
  }
  async queue(input, reason = "pending", invalidate = true) {
    const scope = await this.scope(input); await this.repo.request(scope, reason, invalidate); return scope;
  }
  async refresh(scope) {
    await this.repo.request(scope);
    const claim = await this.repo.claim(scope); if (!claim) return null;
    try {
      const link = await this.d.getGuardianStudentLink({guardianId: scope.guardianId, studentId: scope.studentId});
      if (!(link?.isActive || link?.state === "active")) throw paymentError("permission-denied", "This student is no longer linked.");
      const context = await this.d.createPaymentProviderForContext({providerName: "stripe", mode: scope.mode});
      const owned = await loadOwnedStripeSubscription({...this.d, createPaymentProviderContext: async () => context},
        {internalReference: scope.guardianId, subscriptionReference: scope.subscriptionReference});
      const details = await this.d.readLive({internalReference: scope.guardianId, subscriptionReference: scope.subscriptionReference}, owned);
      return await this.repo.save(scope, details, details[metadata]?.subscription || owned.subscription,
        details[metadata]?.paymentMethodReference ?? owned.subscription.defaultPaymentMethodReference ?? null, claim);
    } catch (error) {
      await this.repo.fail(scope, claim, ["permission-denied", "not-found"].includes(error.code) ? error.code : "unavailable");
      if (["permission-denied", "not-found"].includes(error.code)) throw error;
      return null;
    }
  }
  async capture(input, details) {
    const scope = await this.scope(input);
    await this.repo.request(scope);
    return this.repo.save(scope, details, details[metadata]?.subscription || null, details[metadata]?.paymentMethodReference);
  }
  async captureAction(input, action) {
    const scope = await this.scope(input), existing = await this.repo.request(scope);
    const student = await this.d.getStudentSubscription(scope.studentId);
    const paidUntil = student?.activeUntil?.toDate?.() || student?.activeUntil;
    const payload = {...existing.payload, subscriptionReference: scope.subscriptionReference, studentId: scope.studentId,
      studentName: existing.payload?.studentName || scope.studentId, planId: action.planId || existing.payload?.planId || scope.record.planId,
      subscriptionStatus: action.subscriptionStatus || existing.payload?.subscriptionStatus || scope.record.status,
      paymentState: action.paymentState || (action.action === "complete" ? "paid" : "processing"),
      currentCard: action.savedCard || existing.payload?.currentCard || null, renewal: action.billingReason === "subscription_cycle" ? action : null,
      nextChargeAt: action.action === "complete" && paidUntil ? iso(paidUntil) : existing.payload?.nextChargeAt || null,
      linkedInvoiceIsCurrent: true};
    const changedCard = action.savedCard && JSON.stringify(action.savedCard) !== JSON.stringify(existing.payload?.currentCard);
    await this.repo.save(scope, payload, action[metadata]?.subscription || null,
      action[metadata]?.paymentMethodReference ?? (changedCard ? null : undefined));
    await this.repo.request(scope, "action_completed", true);
  }
  async command(input, operation) {
    await this.queue(input, "action_pending");
    const result = await operation();
    try {
      if (result?.subscriptionReference && result.subscriptionStatus && result.currentCard !== undefined) await this.capture(input, result);
      else if (result?.action && result.subscriptionStatus) await this.captureAction(input, result);
      else await this.queue(input, "action_completed");
    } catch (error) {
      // A durable job was written before the command. Never encourage another
      // charge because recording an already confirmed result was interrupted.
      this.d.onCaptureError?.(error);
    }
    return result;
  }
  async enqueueIdentity(input, reason = "billing_changed") {
    const mode = input.mode || input.paymentMode, reference = input.subscriptionReference || input.paymentSubscriptionReference;
    const student = await this.d.getStudentSubscription(input.studentId);
    const root = [student?.billingSummary, student].find(v => v?.paymentMode === mode && v.paymentSubscriptionReference === reference);
    const customerReference = input.customerReference || root?.paymentCustomerReference;
    if (!customerReference) return;
    const customer = await this.d.getCustomerRecordByReference({mode, customerReference});
    if (!customer) return;
    const record = await this.d.getSubscriptionRecord({mode, customerReference, subscriptionReference: reference});
    if (record?.studentId !== input.studentId) return;
    return this.repo.request({mode, studentId: input.studentId, subscriptionReference: reference, customerReference,
      guardianId: customer.internalReference}, reason, true);
  }
  async eventIdentity({mode, event}) {
    const object = event.data?.object, ref = value => typeof value === "object" ? value?.id : value;
    const subscriptionReference = object?.object === "subscription" ? object.id : ref(object?.parent?.subscription_details?.subscription || object?.subscription) || object?.metadata?.rhx_subscription;
    const customerReference = ref(object?.customer);
    if (!subscriptionReference || !customerReference) return null;
    const record = await this.d.getSubscriptionRecord({mode, customerReference, subscriptionReference});
    return record?.studentId ? {mode, subscriptionReference, customerReference, studentId: record.studentId} : null;
  }
  async execute({limit = 25, deadline = Date.now() + 45000} = {}) {
    const rows = await this.repo.listDue({limit}); let examined = 0, errors = 0;
    for (const scope of rows) {
      if (Date.now() >= deadline) break;
      try {examined++; if (!await this.refresh(scope)) errors++;} catch {errors++;}
    }
    return {examined, errors};
  }
}
module.exports = {SubscriptionPaymentViews};
