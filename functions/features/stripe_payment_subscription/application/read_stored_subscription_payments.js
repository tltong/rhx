const {paymentError} = require("./load_owned_subscription_invoice");
const {quote} = require("./manage_guardian_subscriptions");
const {studentSubscriptionAccess} = require("../../syllabus_subscription/domain/student_subscription_access");
const {iso, hydrate} = require("../../syllabus_subscription/domain/subscription_payment_view");
const {publicRetry} = require("../../syllabus_subscription/domain/renewal_retry");
const cancellationView = value => value ? {state: value.state, ...Object.fromEntries(["requestedAt", "cancelledAt", "accessUntil"].map(k => [k, iso(value[k])]))} : null;
const date = value => value?.toDate?.() || (typeof value === "string" ? new Date(value) : value);
const same = (value, mode, reference) => value?.paymentMode === mode && value.paymentSubscriptionReference === reference;
const ended = status => ["canceled", "incomplete_expired", "missing"].includes(status);
const changeable = status => ["active", "trialing", "past_due", "unpaid", "paused"].includes(status);
function identifier(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.length > 500) throw paymentError("invalid-argument", `${label} is invalid.`);
  return value.trim();
}
class ReadStoredSubscriptionPayments {
  constructor(dependencies) {this.d = dependencies; this.views = dependencies.views; this.repo = this.views.repo; this.now = dependencies.now || (() => new Date());}
  async context(input) {
    const internalReference = identifier(input.internalReference, "guardian"), config = await this.d.getPaymentConfig();
    if (config?.provider !== "stripe") throw paymentError("failed-precondition", "Stripe subscriptions are unavailable.");
    const customer = await this.d.getCustomerRecordByInternalReference({mode: config.mode, internalReference});
    const records = customer ? await this.d.listSubscriptionRecords({mode: config.mode, customerReference: customer.customerReference}) : [];
    return {internalReference, mode: config.mode, customer, records};
  }
  scope(context, record) {
    return {guardianId: context.internalReference, mode: context.mode, customerReference: context.customer.customerReference,
      subscriptionReference: record.subscriptionReference, studentId: record.studentId, record};
  }
  async view(scope) {return await this.repo.get(scope) || this.repo.request(scope);}
  async current(context, studentId, student) {
    if (student?.paymentMode === "prod" && context.mode === "test") return {canCreate: false, blockedReason: "different_payment_environment"};
    const checkout = await this.d.getStudentSubscriptionCheckout?.({studentId, mode: context.mode});
    const records = context.records.filter(r => r.studentId === studentId).sort((a,b) => +date(b.createdAt) - +date(a.createdAt));
    const root = student?.billingSummary?.paymentMode === context.mode ? student.billingSummary
      : student?.paymentMode === context.mode ? student : null;
    const refs = [...new Set([root?.paymentSubscriptionReference,
      checkout?.internalReference === context.internalReference ? checkout.subscriptionReference : null,
      ...records.map(r => r.subscriptionReference)].filter(Boolean))];
    let cancellation = same(student?.subscriptionCancellation, context.mode, root?.paymentSubscriptionReference) ? student.subscriptionCancellation : null;
    for (const reference of refs) {
      const record = records.find(r => r.subscriptionReference === reference);
      if (!record) {
        if (cancellation?.state === "cancelled" && cancellation.paymentSubscriptionReference === reference) continue;
        return {subscriptionReference: checkout?.internalReference === context.internalReference && checkout.subscriptionReference === reference ? reference : null,
          canCreate: false, blockedReason: checkout?.subscriptionReference === reference ? "checkout_needs_review" : "managed_by_another_guardian", cancellation};
      }
      const scope = this.scope(context, record), view = await this.view(scope);
      const summary = same(student?.billingSummary, context.mode, reference) ? student.billingSummary : null;
      const cancelled = same(student?.subscriptionCancellation, context.mode, reference) && student.subscriptionCancellation.state === "cancelled";
      const recentSummary = summary && (!view.observedAt || +date(summary.observedAt || summary.updatedAt) > +date(view.observedAt));
      const status = cancelled ? "canceled" : recentSummary ? summary.subscriptionStatus : view.payload?.subscriptionStatus || summary?.subscriptionStatus || record.status;
      if (ended(status)) continue;
      return {subscriptionReference: reference, canCreate: false, record, view, scope,
        cancellation: same(student?.subscriptionCancellation, context.mode, reference) ? student.subscriptionCancellation : null};
    }
    if (checkout && !checkout.subscriptionReference) return {canCreate: false, blockedReason: "checkout_needs_review", cancellation};
    return {canCreate: true, cancellation};
  }
  async getOptions(input = {}) {
    const context = await this.context(input);
    const links = await this.d.listActiveGuardianStudentLinks(context.internalReference);
    const students = (await Promise.all(links.map(async link => {
      const profile = await this.d.getStudentById(link.studentId);
      return profile ? {studentId: link.studentId, studentName: profile.name || link.studentId, country: profile.country || null} : null;
    }))).filter(Boolean).sort((a,b) => a.studentName.localeCompare(b.studentName));
    let studentId = input.studentId;
    if (!studentId && input.subscriptionReference) {
      studentId = context.records.find(r => r.subscriptionReference === input.subscriptionReference)?.studentId;
      if (!studentId) throw paymentError("not-found", "This subscription is unavailable for your guardian account.");
    }
    studentId ||= students[0]?.studentId;
    if (!studentId) return {students, selectedStudentId: null, paymentMode: null, subscriptionReference: null, plans: [], canCreate: false, blockedReason: "no_linked_students", savedCard: null};
    const profile = students.find(s => s.studentId === studentId);
    if (!profile) throw paymentError("permission-denied", "Choose a currently linked student.");
    const student = await this.d.getStudentSubscription(studentId), current = await this.current(context, studentId, student);
    let plans = [], available = true;
    try {plans = profile.country ? await this.d.listSubscriptionPlanChoices(profile.country) : [];} catch {available = false;}
    let savedCard = null;
    if (current.canCreate && context.customer) {
      for (const record of context.records) {
        if (!record.studentId) continue;
        const view = await this.repo.get(this.scope(context, record));
        if (view?.defaultPaymentMethodReference && view.payload?.currentCard) {
          const c = view.payload.currentCard;
          if (new Date(Date.UTC(c.expiryYear, c.expiryMonth, 1)) > this.now()) {savedCard = {...c, paymentMethodReference: view.defaultPaymentMethodReference}; break;}
        }
      }
    }
    const details = current.scope ? await this.getDetails({internalReference: context.internalReference, subscriptionReference: current.subscriptionReference}) : null;
    const pending = current.record?.pendingPlanChange, effectiveAt = date(pending?.effectiveAt);
    const nextPlan = pending && effectiveAt > this.now() ? {planId: pending.planId, state: pending.state, effectiveAt: iso(effectiveAt)} : null;
    const billing = current.view?.billing;
    const canChangePlan = plans.length > 0 && details?.syncState?.state === "current" && details.paymentState === "paid"
      && (details.subscriptionStatus === "active" || details.subscriptionStatus === "trialing" && (details.firstChargeAt || details.renewalRecovery?.state === "completed"))
      && !billing?.paused && !details.cancelAtPeriodEnd && (!billing?.scheduleReference || !!pending)
      && details.applicationStatus !== "suspended" && !details.cancellation
      && date(details.nextChargeAt) > new Date(+this.now() + 60000);
    const paidUntil = date(student?.activeUntil);
    return {students, selectedStudentId: studentId, paymentMode: context.mode, subscriptionReference: current.subscriptionReference || null,
      canCreate: current.canCreate === true && plans.length > 0,
      blockedReason: current.blockedReason || (!available ? "plans_unavailable" : !plans.length ? "no_plans" : null),
      plans: plans.map(p => ({planId: p.planId, name: p.name, months: p.months, amount: p.amount, currency: p.currency,
        quoteReference: quote(profile.country, p.planId, {stripeProductName: p.stripeProductName, amount: p.amount, currency: p.currency,
          interval: p.interval, intervalCount: p.intervalCount}, context.mode)})),
      currentPlanId: details?.planId || current.record?.planId || null, savedCard, canChangePlan: !!canChangePlan, nextPlan,
      nextRenewalAt: details?.nextChargeAt || null,
      ...(current.cancellation ? {cancellation: cancellationView(current.cancellation)} : {}),
      ...(current.canCreate && student?.subscriptionType === "ongoing" && current.cancellation?.state === "cancelled" && paidUntil > this.now() ? {firstChargeAt: iso(paidUntil)} : {}),
      syncState: details?.syncState || {state: "current", lastConfirmedAt: null}};
  }
  async getDetails(input) {
    const scope = await this.views.scope(input), view = await this.view(scope);
    const student = hydrate(await this.d.getStudentSubscription(scope.studentId)), profile = await this.d.getStudentById(scope.studentId);
    const summary = same(student?.billingSummary, scope.mode, scope.subscriptionReference) ? student.billingSummary : null;
    const rootNewer = !!summary && (!view.observedAt || +date(summary.observedAt || summary.updatedAt) > +date(view.observedAt));
    if (rootNewer && !view.pending) await this.repo.request(scope, "ledger_changed", true);
    const payload = structuredClone(view.payload || {});
    const cancellation = same(student?.subscriptionCancellation, scope.mode, scope.subscriptionReference) ? student.subscriptionCancellation : payload.cancellation;
    const status = cancellation?.state === "cancelled" ? "canceled" : rootNewer ? summary.subscriptionStatus : payload.subscriptionStatus || summary?.subscriptionStatus || scope.record.status || "unknown";
    const paymentState = rootNewer ? summary.paymentState : payload.paymentState || summary?.paymentState || "unavailable";
    const pending = !view.payload || view.pending || rootNewer || !!view.leaseToken
      || payload.paymentState === "processing" || payload.recoveryPending || cancellation?.state === "pending"
      || view.nextActionAt && date(view.nextActionAt) <= this.now();
    const invoiceReference = rootNewer ? summary.invoiceReference : payload.renewal?.invoiceReference || summary?.invoiceReference;
    let linkedInvoiceIsCurrent = !input.invoiceReference || input.invoiceReference === invoiceReference || input.invoiceReference === payload.renewal?.attemptInvoiceReference;
    if (!linkedInvoiceIsCurrent) {
      const invoice = await this.d.getInvoiceRecord({studentId: scope.studentId, paymentProvider: "stripe", paymentMode: scope.mode,
        paymentSubscriptionReference: scope.subscriptionReference, invoiceReference: input.invoiceReference});
      if (!invoice) throw paymentError("not-found", "This invoice is unavailable.");
    }
    const recovery = same(student?.renewalRecovery, scope.mode, scope.subscriptionReference) ? student.renewalRecovery : null;
    if (rootNewer && summary.billingReason === "subscription_cycle") {
      payload.renewal = {action: paymentState === "paid" ? "complete" : paymentState === "processing" ? "wait" : paymentState === "authentication_required" ? "confirm_payment" : "unavailable",
        subscriptionReference: scope.subscriptionReference, invoiceReference: summary.invoiceReference,
        invoiceStatus: summary.invoiceStatus, subscriptionStatus: status, billingReason: summary.billingReason,
        paymentState, paymentStatus: summary.paymentIntentStatus || null, paymentClientSecret: null,
        requiresActionFetch: paymentState === "authentication_required", amountDue: recovery?.version === 2 && paymentState !== "paid" ? scope.record.amount : summary.amountRemaining,
        currency: summary.currency || scope.record.currency, canRetry: false, canPayWithNewCard: false,
        savedCard: payload.currentCard || null, failureCode: summary.failureCode || null,
        nextPaymentAttemptAt: iso(summary.nextPaymentAttemptAt), studentId: scope.studentId, planId: student?.planId || scope.record.planId};
    }
    if (recovery) payload.renewalRecovery = Object.fromEntries(["version", "state", "firstFailedAt", "graceUntil", "paidAt", "paidThrough", "completedAt", "lastErrorCode"].map(k => [k,
      ["firstFailedAt", "graceUntil", "paidAt", "paidThrough", "completedAt"].includes(k) ? iso(recovery[k]) : recovery[k] ?? null]));
    const access = studentSubscriptionAccess(student, this.now());
    const cardChange = payload.canChangeCard === true && changeable(status) && !cancellation && !payload.recoveryPending;
    const result = {...payload, subscriptionReference: scope.subscriptionReference, subscriptionStatus: status,
      studentId: scope.studentId, studentName: profile?.name || scope.studentId,
      planId: same(student, scope.mode, scope.subscriptionReference) && student.planId ? student.planId : payload.planId || scope.record.planId,
      paymentState, applicationStatus: access.allowed ? "active" : "suspended", linkedInvoiceIsCurrent,
      canChangeCard: cardChange, canCancelSubscription: !ended(status) && !cancellation,
      cancellation: cancellationView(cancellation),
      currentCard: payload.currentCard || null, renewalRetry: rootNewer ? publicRetry(summary.renewalRetry, true) || payload.renewalRetry || null : payload.renewalRetry || null,
      nextChargeAt: ended(status) || cancellation ? null : payload.nextChargeAt || null,
      accessUntil: iso(access.expiresAt),
      syncState: {state: pending ? "pending" : "current", lastConfirmedAt: iso(view.observedAt || summary?.observedAt),
        unavailable: !!view.lastErrorCode}};
    result.cardChangeTargets = []; result.canChangeAllStudents = false;
    if (cardChange) {
      const context = await this.context(input), links = await this.d.listActiveGuardianStudentLinks(scope.guardianId);
      for (const record of context.records.filter(r => links.some(link => link.studentId === r.studentId))) {
        const target = await this.repo.get(this.scope(context, record));
        if (target?.payload?.canChangeCard && changeable(target.payload.subscriptionStatus) && !target.payload.cancellation && !target.payload.recoveryPending) {
          const profile = await this.d.getStudentById(record.studentId);
          result.cardChangeTargets.push({subscriptionReference: record.subscriptionReference, studentId: record.studentId,
            studentName: profile?.name || record.studentId, planId: target.payload.planId || record.planId});
        }
      }
      result.canChangeAllStudents = result.cardChangeTargets.length > 1 && result.cardChangeTargets.some(t => t.subscriptionReference === scope.subscriptionReference);
    }
    if (cancellation) {
      result.canCancelRenewal = false; result.canCancelPendingPayment = false;
      if (result.renewal) result.renewal = {...result.renewal, action: "unavailable", canRetry: false, canPayWithNewCard: false, paymentClientSecret: null};
    }
    return JSON.parse(JSON.stringify(result));
  }
}
module.exports = {ReadStoredSubscriptionPayments};
