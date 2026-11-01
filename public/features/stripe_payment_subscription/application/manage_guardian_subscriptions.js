import {normalizeSavedCard} from "./get_subscription_payment_action.js?v=20261101-stored-status-v1";
import {normalizeCancellation, normalizeSyncState} from "./manage_subscription_payment.js?v=20261101-stored-status-v1";
function id(value, field) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.length > 500) throw Error(`Invalid ${field}.`);
  return value.trim();
}
function checkout(input) {
  if (!/^[a-f0-9]{64}$/.test(input.quoteReference || "")) throw Error("Refresh and review the selected plan price.");
  return {studentId: id(input.studentId, "studentId"), planId: id(input.planId, "planId"),
    quoteReference: input.quoteReference, idempotencyReference: id(input.idempotencyReference, "idempotencyReference"),
    ...(input.setupIntentReference ? {setupIntentReference: id(input.setupIntentReference, "setupIntentReference")} : {}),
    ...(input.savedCardReference ? {savedCardReference: id(input.savedCardReference, "savedCardReference")} : {})};
}
export class ManageGuardianSubscriptions {
  constructor(gateway) {this.gateway = gateway;}
  async getOptions(input = {}) {
    if (input.refreshFromStripe !== undefined && typeof input.refreshFromStripe !== "boolean") throw Error("Invalid Stripe refresh option.");
    const result = await this.gateway.getGuardianSubscriptionOptions({
      ...(input.refreshFromStripe === undefined ? {} : {refreshFromStripe: input.refreshFromStripe}),
      ...(input.studentId ? {studentId: id(input.studentId, "studentId")} : {}),
      ...(input.subscriptionReference ? {subscriptionReference: id(input.subscriptionReference, "subscriptionReference")} : {})});
    return this.normalizeOptions(result);
  }
  normalizeOptions(result) {
    if (!result || !Array.isArray(result.students) || !Array.isArray(result.plans)) throw Error("Invalid student subscription options.");
    const students = result.students.map(student => ({studentId: id(student.studentId, "studentId"),
      studentName: String(student.studentName || student.studentId), country: student.country || null}));
    if (result.selectedStudentId && !students.some(student => student.studentId === result.selectedStudentId)) throw Error("Unexpected selected student.");
    if (result.selectedStudentId && !["test", "prod"].includes(result.paymentMode)) throw Error("Invalid subscription payment environment.");
    const plans = result.plans.map(plan => {
      if (!Number.isSafeInteger(plan.amount) || plan.amount < 0 || !Number.isInteger(plan.months) || plan.months < 1
        || !/^[a-z]{3}$/.test(plan.currency || "") || !/^[a-f0-9]{64}$/.test(plan.quoteReference || "")) throw Error("Invalid subscription plan.");
      return {planId: id(plan.planId, "planId"), name: String(plan.name), months: plan.months,
        amount: plan.amount, currency: plan.currency, quoteReference: plan.quoteReference};
    });
    if (result.subscriptionReference && !/^sub_[a-zA-Z0-9_]+$/.test(result.subscriptionReference)) throw Error("Invalid student subscription.");
    let savedCard = null;
    if (result.savedCard) {
      if (!/^pm_[a-zA-Z0-9_]+$/.test(result.savedCard.paymentMethodReference || "")) throw Error("Invalid saved card reference.");
      savedCard = {...normalizeSavedCard(result.savedCard), paymentMethodReference: result.savedCard.paymentMethodReference};
    }
    let nextPlan = null;
    if (result.nextPlan) {
      if (!["scheduled", "updating"].includes(result.nextPlan.state) || !Number.isFinite(Date.parse(result.nextPlan.effectiveAt))) throw Error("Invalid pending plan change.");
      nextPlan = {planId: id(result.nextPlan.planId, "planId"), state: result.nextPlan.state, effectiveAt: result.nextPlan.effectiveAt};
    }
    return {students, plans, selectedStudentId: result.selectedStudentId || null, paymentMode: result.paymentMode || null,
      ...(result.syncState ? {syncState: normalizeSyncState(result.syncState)} : {}),
      ...(result.cancellation ? {cancellation: normalizeCancellation(result.cancellation)} : {}),
      ...(result.firstChargeAt ? {firstChargeAt: result.firstChargeAt} : {}),
      subscriptionReference: result.subscriptionReference || null, currentPlanId: result.currentPlanId || null,
      canCreate: result.canCreate === true && !result.subscriptionReference && plans.length > 0,
      blockedReason: result.blockedReason || null, savedCard, nextPlan,
      canChangePlan: result.canChangePlan === true && !!result.subscriptionReference,
      nextRenewalAt: result.nextRenewalAt || null};
  }
  async prepare(input) {
    const result = await this.gateway.prepareStudentSubscription(checkout(input));
    if (!/^seti_[a-zA-Z0-9_]+$/.test(result?.setupIntentReference || "") || typeof result.clientSecret !== "string" || !result.clientSecret) {
      throw Error("Invalid subscription card setup.");
    }
    return {setupIntentReference: result.setupIntentReference, clientSecret: result.clientSecret};
  }
  async create(input) {
    const result = await this.gateway.createStudentSubscription(checkout(input));
    if (!/^sub_[a-zA-Z0-9_]+$/.test(result?.subscriptionReference || "") || typeof result.status !== "string") throw Error("Invalid subscription result.");
    return {subscriptionReference: result.subscriptionReference, status: result.status};
  }
  async changePlan(input) {
    return this.normalizeOptions(await this.gateway.changeStudentSubscriptionPlan(checkout(input)));
  }
}
