const {paymentError, requireStripeReference} = require("./load_owned_subscription_invoice");
const FINAL = new Set(["canceled", "incomplete_expired"]);
const {createHash} = require("node:crypto");
const {randomUUID} = require("node:crypto");
const {subscriptionBillingRecord} = require("./billing_plan_version");
function quote(country, planId, terms, mode) {
  return createHash("sha256").update(JSON.stringify([country, planId, terms, mode])).digest("hex");
}
function id(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.length > 500) {
    throw paymentError("invalid-argument", `${label} is invalid.`);
  }
  return value.trim();
}
function masked(method) {return method ? {brand: method.card.brand, last4: method.card.last4,
  expiryMonth: method.card.expiryMonth, expiryYear: method.card.expiryYear,
  paymentMethodReference: method.paymentMethodReference} : null;}
class ManageGuardianSubscriptions {
  constructor(dependencies) {this.dependencies = dependencies; this.now = dependencies.now || (() => new Date());}
  async context(input) {
    const internalReference = id(input.internalReference, "guardian"), studentId = id(input.studentId, "studentId");
    const link = await this.dependencies.getGuardianStudentLink({guardianId: internalReference, studentId});
    if (!link?.isActive) throw paymentError("permission-denied", "Choose a student currently linked to your guardian account.");
    const student = await this.dependencies.getStudentById(studentId);
    if (!student) throw paymentError("not-found", "Student profile is unavailable.");
    const context = await this.dependencies.createPaymentProviderContext();
    if (context.providerName !== "stripe") throw paymentError("failed-precondition", "Stripe subscriptions are unavailable.");
    const customer = await this.dependencies.getCustomerRecordByInternalReference({mode: context.mode, internalReference});
    const records = customer ? await this.dependencies.listSubscriptionRecords({mode: context.mode,
      customerReference: customer.customerReference}) : [];
    return {...context, internalReference, studentId, student, customer, records};
  }
  async current(context) {
    const billing = await this.dependencies.getStudentSubscription(context.studentId);
    if (billing?.subscriptionCancellation?.state === "pending" && billing.subscriptionCancellation.paymentMode === context.mode) {
      return {subscriptionReference: billing.subscriptionCancellation.paymentSubscriptionReference, canCreate: false, blockedReason: "cancellation_pending"};
    }
    const checkout = await this.dependencies.getStudentSubscriptionCheckout?.({studentId: context.studentId, mode: context.mode});
    const records = context.records.filter(record => record.studentId === context.studentId)
      .sort((a, b) => +new Date(b.createdAt?.toDate?.() || b.createdAt) - +new Date(a.createdAt?.toDate?.() || a.createdAt));
    const refs = [...new Set([billing?.billingSummary?.paymentProvider === "stripe" && billing.billingSummary.paymentMode === context.mode
      ? billing.billingSummary.paymentSubscriptionReference : null, billing?.paymentProvider === "stripe" && billing.paymentMode === context.mode
      ? billing.paymentSubscriptionReference : null, ...records.map(record => record.subscriptionReference),
      checkout?.internalReference === context.internalReference ? checkout.subscriptionReference : null].filter(Boolean))];
    for (const reference of refs) {
      let live;
      try {live = await context.paymentProvider.retrieveSubscription(reference, {includeRecoveryDetails: true});}
      catch (error) {if (error.code === "resource_missing") continue; throw error;}
      if (FINAL.has(live.status)) continue;
      let record = records.find(record => record.subscriptionReference === reference);
      if (!record && context.customer && live.customerReference === context.customer.customerReference
        && checkout?.internalReference === context.internalReference && checkout.subscriptionReference === reference) {
        // The provider response was saved before registration failed. Replaying
        // this reservation retrieves the known subscription; it never creates or pays one.
        await this.dependencies.createStripePaymentSubscription({...checkout,
          idempotencyReference: checkout.requestReference, billingTermsSnapshot: checkout.billingTerms});
        record = {planId: checkout.planId, studentId: context.studentId, ...checkout.billingTerms};
      }
      if (!context.customer || live.customerReference !== context.customer.customerReference || !record) {
        return {subscriptionReference: null, canCreate: false, blockedReason: "managed_by_another_guardian"};
      }
      return {subscriptionReference: reference, canCreate: false, blockedReason: null, live,
        record: subscriptionBillingRecord(record, live)};
    }
    if (billing?.paymentMode === "prod" && context.mode === "test") {
      return {subscriptionReference: null, canCreate: false, blockedReason: "different_payment_environment"};
    }
    const created = checkout?.createdAt?.toDate?.() || checkout?.createdAt;
    if (checkout && !checkout.subscriptionReference && this.now() - created >= 23 * 3600000) {
      return {subscriptionReference: null, canCreate: false, blockedReason: "checkout_needs_review"};
    }
    return {subscriptionReference: null, canCreate: true, blockedReason: null};
  }
  async savedCard(context) {
    for (const record of context.records) {
      let subscription;
      try {subscription = await context.paymentProvider.retrieveSubscription(record.subscriptionReference, {includeRecoveryDetails: true});}
      catch (error) {if (error.code === "resource_missing") continue; throw error;}
      if (subscription.customerReference !== context.customer.customerReference
        || !subscription.defaultPaymentMethodReference) continue;
      let method;
      try {method = await context.paymentProvider.retrievePaymentMethod(subscription.defaultPaymentMethodReference);}
      catch (error) {if (error.code === "resource_missing") continue; throw error;}
      if (method.type === "card" && method.card && method.customerReference === context.customer.customerReference
        && new Date(Date.UTC(method.card.expiryYear, method.card.expiryMonth, 1)) > this.now()) return method;
    }
    return null;
  }
  async options(input) {
    const internalReference = id(input.internalReference, "guardian");
    const links = await this.dependencies.listActiveGuardianStudentLinks(internalReference);
    const profiles = await Promise.all(links.map(async link => ({link,
      student: await this.dependencies.getStudentById(link.studentId)})));
    const students = profiles.filter(item => item.student).map(({link, student}) => ({studentId: link.studentId,
      studentName: student.name || link.studentId, country: student.country || null}))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
    let studentId = input.studentId;
    if (!studentId && input.subscriptionReference) {
      const context = await this.dependencies.createPaymentProviderContext();
      const customer = await this.dependencies.getCustomerRecordByInternalReference({mode: context.mode, internalReference});
      const records = customer ? await this.dependencies.listSubscriptionRecords({mode: context.mode, customerReference: customer.customerReference}) : [];
      studentId = records.find(record => record.subscriptionReference === input.subscriptionReference)?.studentId;
      if (!studentId) throw paymentError("not-found", "This subscription is unavailable for your guardian account.");
    }
    studentId ||= students[0]?.studentId;
    if (!studentId) return {students, selectedStudentId: null, paymentMode: null, subscriptionReference: null, plans: [], canCreate: false,
      blockedReason: "no_linked_students", savedCard: null};
    if (!students.some(student => student.studentId === studentId)) throw paymentError("permission-denied", "This student is not currently linked.");
    const context = await this.context({internalReference, studentId});
    const current = await this.current(context);
    let plans = [], plansAvailable = true;
    try {plans = context.student.country ? await this.dependencies.listSubscriptionPlanChoices(context.student.country) : [];}
    catch {plansAvailable = false;}
    const card = current.canCreate && context.customer ? await this.savedCard(context) : null;
    const billing = await this.dependencies.getStudentSubscription(studentId);
    const paidUntil = billing?.activeUntil?.toDate?.() || billing?.activeUntil;
    let pending = current.record?.pendingPlanChange;
    if (pending?.state === "updating" && !pending.leaseToken && context.paymentProvider.confirmedSubscriptionPlanChange) {
      try {
        const scope = {mode: context.mode, customerReference: context.customer.customerReference,
          subscriptionReference: current.subscriptionReference, priceReference: pending.priceReference,
          effectiveAt: pending.effectiveAt, planId: pending.planId, leaseToken: null};
        const confirmed = await context.paymentProvider.confirmedSubscriptionPlanChange(scope);
        if (confirmed && await this.dependencies.finishSubscriptionPlanChange({...scope, ...confirmed})) pending = {...pending, state: "scheduled"};
      } catch { /* Keep the uncertain state visible; payment management remains available. */ }
    }
    const pendingAt = pending?.effectiveAt?.toDate?.() || pending?.effectiveAt;
    const nextPlan = pending && pendingAt > this.now() ? {planId: pending.planId, effectiveAt: pendingAt.toISOString(),
      state: pending.state} : null;
    let canChangePlan = plans.length > 0 && !!current.live?.currentPriceReference
      && (current.live.status === "active" || current.live.status === "trialing" && current.live.recoveryState === "completed") && !current.live.paused
      && !current.live.cancelAtPeriodEnd && (!current.live.scheduleReference || !!pending)
      && current.live.currentPeriodEnd > new Date(+this.now() + 60000)
      && billing?.applicationStatus !== "suspended" && (!billing?.renewalRecovery || billing.renewalRecovery.state === "completed");
    if (canChangePlan) {
      const invoice = current.live.latestInvoiceReference && await context.paymentProvider.retrieveInvoicePaymentContext(current.live.latestInvoiceReference, {includeRecoveryDetails: true});
      canChangePlan = invoice?.invoiceStatus === "paid" && invoice.amountRemaining === 0;
    }
    return {students, selectedStudentId: studentId, paymentMode: context.mode, subscriptionReference: current.subscriptionReference,
      canCreate: current.canCreate && plans.length > 0,
      blockedReason: current.blockedReason || (!plansAvailable ? "plans_unavailable" : !plans.length ? "no_plans" : null),
      plans: plans.map(plan => ({planId: plan.planId, name: plan.name, months: plan.months,
        amount: plan.amount, currency: plan.currency, quoteReference: quote(context.student.country, plan.planId,
          {stripeProductName: plan.stripeProductName, amount: plan.amount, currency: plan.currency,
            interval: plan.interval, intervalCount: plan.intervalCount}, context.mode)})),
      savedCard: masked(card), currentPlanId: current.record?.planId || null,
      ...(billing?.subscriptionCancellation?.paymentMode === context.mode ? {cancellation: JSON.parse(JSON.stringify(billing.subscriptionCancellation))} : {}),
      ...(current.canCreate && billing?.subscriptionType === "ongoing" && billing?.subscriptionCancellation?.state === "cancelled" && paidUntil > this.now()
        ? {firstChargeAt: paidUntil.toISOString()} : {}),
      canChangePlan, nextPlan,
      nextRenewalAt: current.live?.currentPeriodEnd?.toISOString() || null,
      country: context.student.country || null};
  }
  async changePlan(input) {
    const context = await this.context(input), current = await this.current(context), planId = id(input.planId, "planId");
    if (!current.subscriptionReference || !current.live?.currentPriceReference) throw paymentError("failed-precondition", "No current subscription can accept a plan change.");
    const billing = await this.dependencies.getStudentSubscription(context.studentId);
    if (billing?.subscriptionCancellation) throw paymentError("failed-precondition", "This subscription is cancelled or cancellation is pending.");
    if (billing?.applicationStatus === "suspended" || billing?.renewalRecovery && billing.renewalRecovery.state !== "completed") {
      throw paymentError("failed-precondition", "Resolve the unpaid renewal before changing plans.");
    }
    const terms = await this.dependencies.getSubscriptionPlanBillingTerms({country: context.student.country, planId});
    if (!terms || input.quoteReference !== quote(context.student.country, planId, terms, context.mode)) {
      throw paymentError("failed-precondition", "This plan price changed. Refresh and review it before continuing.");
    }
    if (terms.currency !== current.record.currency) {
      throw paymentError("failed-precondition", "A currency change requires support review before updating this subscription.");
    }
    if ((current.live.status !== "active" && !(current.live.status === "trialing" && current.live.recoveryState === "completed"))
      || current.live.paused || current.live.cancelAtPeriodEnd
      || current.live.currentPeriodEnd <= new Date(+this.now() + 60000)) {
      throw paymentError("failed-precondition", "This subscription cannot change plans until its current billing state is resolved.");
    }
    const priceReference = await context.paymentProvider.resolveSubscriptionPrice(terms);
    const scope = {mode: context.mode, studentId: context.studentId, customerReference: context.customer.customerReference,
      subscriptionReference: current.subscriptionReference, leaseToken: randomUUID(), priceReference,
      effectiveAt: current.live.currentPeriodEnd};
    const intent = await this.dependencies.claimSubscriptionPlanChange({...scope, planId, terms, priceReference,
      idempotencyReference: id(input.idempotencyReference, "idempotencyReference"),
      existingScheduleReference: current.live.scheduleReference,
      currentPriceReference: current.live.currentPriceReference, effectiveAt: current.live.currentPeriodEnd,
      subscriptionStartDate: current.live.subscriptionStartDate});
    let scheduleReference;
    try {
      ({scheduleReference} = await context.paymentProvider.scheduleSubscriptionPlanChange({...scope, planId, terms, priceReference,
        idempotencyReference: intent.idempotencyReference,
        scheduleWasAbsent: intent.scheduleWasAbsent,
        currentPriceReference: current.live.currentPriceReference, effectiveAt: current.live.currentPeriodEnd, now: this.now()}));
    } finally {await this.dependencies.finishSubscriptionPlanChange({...scope, scheduleReference});}
    const readOptions = this.dependencies.readStoredOptions || (value => this.options(value));
    return readOptions({internalReference: context.internalReference, studentId: context.studentId});
  }
  async prepare(input) {
    const context = await this.context(input), current = await this.current(context);
    if (!current.canCreate) throw paymentError("failed-precondition", "This student already has a subscription or needs billing review.");
    const planId = id(input.planId, "planId"), attempt = id(input.idempotencyReference, "idempotencyReference");
    const terms = context.student.country && await this.dependencies.getSubscriptionPlanBillingTerms({country: context.student.country, planId});
    if (!terms) {
      throw paymentError("not-found", "Choose an available subscription plan for this student.");
    }
    if (input.quoteReference !== quote(context.student.country, planId, terms, context.mode)) {
      throw paymentError("failed-precondition", "This plan price changed. Refresh and review it before continuing.");
    }
    const customerReference = await this.dependencies.createStripePaymentCustomer({internalReference: context.internalReference,
      email: input.email});
    const intent = await context.paymentProvider.createSetupIntent(customerReference, {idempotencyReference: attempt,
      metadata: {purpose: "student_subscription_checkout", internalReference: context.internalReference,
        studentId: context.studentId, planId, mode: context.mode, quoteReference: input.quoteReference}});
    return {setupIntentReference: intent.setupIntentReference, clientSecret: intent.clientSecret};
  }
  async create(input) {
    const context = await this.context(input), planId = id(input.planId, "planId");
    const billing = await this.dependencies.getStudentSubscription(context.studentId);
    if (billing?.subscriptionCancellation?.state === "pending") throw paymentError("failed-precondition", "Wait for cancellation to be confirmed before subscribing again.");
    const terms = await this.dependencies.getSubscriptionPlanBillingTerms({country: context.student.country, planId});
    if (!terms || input.quoteReference !== quote(context.student.country, planId, terms, context.mode)) {
      throw paymentError("failed-precondition", "This plan price changed. Refresh and review it before continuing.");
    }
    let paymentMethodReference;
    if (input.setupIntentReference) {
      const intent = await context.paymentProvider.retrieveSetupIntent(requireStripeReference(input.setupIntentReference, "seti_", "setupIntentReference"));
      if (!context.customer || intent.customerReference !== context.customer.customerReference || intent.status !== "succeeded"
        || intent.usage !== "off_session" || intent.metadata.purpose !== "student_subscription_checkout"
        || intent.metadata.internalReference !== context.internalReference || intent.metadata.studentId !== context.studentId
        || intent.metadata.planId !== planId || intent.metadata.mode !== context.mode
        || intent.metadata.quoteReference !== input.quoteReference
        || !intent.createdAt || this.now() - intent.createdAt > 23 * 3600000 || intent.createdAt > this.now()) {
        throw paymentError("failed-precondition", "Card setup is unavailable or does not match this student and plan.");
      }
      paymentMethodReference = intent.paymentMethodReference;
    } else {
      paymentMethodReference = (await this.savedCard(context))?.paymentMethodReference;
      if (!paymentMethodReference || input.savedCardReference !== paymentMethodReference) {
        throw paymentError("failed-precondition", "The saved card changed. Refresh and review the card before creating this subscription.");
      }
    }
    if (!context.customer || !paymentMethodReference) throw paymentError("failed-precondition", "Set up a card before creating this subscription.");
    const method = await context.paymentProvider.retrievePaymentMethod(paymentMethodReference);
    if (method.type !== "card" || method.customerReference !== context.customer.customerReference) {
      throw paymentError("failed-precondition", "The card does not belong to this guardian.");
    }
    if (!await this.dependencies.getStudentSubscription(context.studentId)) {
      try {await this.dependencies.createStudentSubscription({studentId: context.studentId, subscriptionType: "trial"});}
      catch (error) {if (error.code !== "already-exists") throw error;}
    }
    const created = await this.dependencies.createStripePaymentSubscription({internalReference: context.internalReference,
      studentId: context.studentId, customerReference: context.customer.customerReference, paymentMethodReference,
      country: context.student.country, planId, billingTermsSnapshot: terms,
      idempotencyReference: id(input.idempotencyReference, "idempotencyReference")});
    return {subscriptionReference: created.subscriptionReference, status: created.status};
  }
}
module.exports = {ManageGuardianSubscriptions, quote};
