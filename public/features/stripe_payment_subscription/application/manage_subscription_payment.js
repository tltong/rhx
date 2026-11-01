import {normalizeSubscriptionReference, normalizeInvoiceReference,
  normalizeSavedCard, normalizePaymentActionResult}
  from "./get_subscription_payment_action.js?v=20261101-stored-status-v1";

export function normalizeCardChangeScope(value) {
  if (!["subscription", "all_students"].includes(value)) throw Error("Invalid card-change scope.");
  return value;
}
export function normalizeCardTargets(targets = []) {
  if (!Array.isArray(targets)) throw Error("Unexpected student subscriptions.");
  return targets.map(target => Object.freeze({subscriptionReference: normalizeSubscriptionReference(target.subscriptionReference),
    studentId: String(target.studentId), studentName: String(target.studentName || target.studentId), planId: target.planId || null}));
}
function inputReferences(input) {
  return {subscriptionReference: normalizeSubscriptionReference(input?.subscriptionReference),
    ...(input?.invoiceReference ? {invoiceReference: normalizeInvoiceReference(input.invoiceReference)} : {})};
}
export function normalizeSyncState(value) {
  if (!value) return null;
  if (!["current", "pending"].includes(value.state) || value.lastConfirmedAt != null
    && (typeof value.lastConfirmedAt !== "string" || !Number.isFinite(Date.parse(value.lastConfirmedAt)))) throw Error("Invalid payment update status.");
  return Object.freeze({state: value.state, lastConfirmedAt: value.lastConfirmedAt || null, unavailable: value.unavailable === true});
}
export function normalizeCancellation(value) {
  if (!value) return null;
  if (!["pending", "cancelled"].includes(value.state)) throw Error("Invalid subscription cancellation state.");
  const result = {state: value.state};
  for (const key of ["requestedAt", "cancelledAt", "accessUntil"]) {
    if (value[key] != null && (typeof value[key] !== "string" || !Number.isFinite(Date.parse(value[key])))) throw Error("Invalid subscription cancellation date.");
    result[key] = value[key] || null;
  }
  return Object.freeze(result);
}
export function normalizeRenewalRetry(value) {
  if (!value) return null;
  const states = ["scheduled", "leased", "awaiting_action", "processing", "completed", "exhausted", "stopped"];
  if (!states.includes(value.state) || !Number.isInteger(value.maxRetries) || value.maxRetries < 0 || value.maxRetries > 10
    || !Number.isInteger(value.intervalHours) || value.intervalHours < 1 || value.intervalHours > 168
    || !Number.isInteger(value.attemptsMade) || value.attemptsMade < 0 || value.attemptsMade > value.maxRetries) {
    throw Error("Unexpected renewal retry details.");
  }
  const result = {state: value.state, maxRetries: value.maxRetries,
    intervalHours: value.intervalHours, attemptsMade: value.attemptsMade, lastOutcome: String(value.lastOutcome || "") || null};
  for (const field of ["firstFailedAt", "graceUntil", "nextAttemptAt", "lastAttemptAt", "completedAt", "exhaustedAt"]) {
    if (value[field] != null && (typeof value[field] !== "string" || !Number.isFinite(new Date(value[field]).getTime()))) {
      throw Error("Unexpected renewal retry timestamp.");
    }
    result[field] = value[field] || null;
  }
  return Object.freeze(result);
}
export function normalizeRenewalRecovery(value) {
  if (!value) return null;
  if (![1, 2].includes(value.version) || !["pending_hold", "held", "suspended", "pending_reset", "pending_payment", "cancelled", "completed", "manual_review"].includes(value.state)) {
    throw Error("Unexpected renewal recovery state.");
  }
  const result = {version: value.version, state: value.state, lastErrorCode: value.lastErrorCode || null};
  for (const field of ["firstFailedAt", "graceUntil", "paidAt", "paidThrough", "completedAt"]) {
    if (value[field] != null && (typeof value[field] !== "string" || !Number.isFinite(new Date(value[field]).getTime()))) {
      throw Error("Unexpected renewal recovery timestamp.");
    }
    result[field] = value[field] || null;
  }
  if (["completed", "pending_reset"].includes(result.state) && (!result.paidAt || !result.paidThrough
    || new Date(result.paidThrough) <= new Date(result.paidAt))) throw Error("Unexpected recovered billing period.");
  return Object.freeze(result);
}
export function normalizePaymentDetails(value, expected) {
  if (!value || value.subscriptionReference !== expected) throw Error("Unexpected subscription payment details.");
  const applicationStatus = value.applicationStatus || "active";
  if (!["active", "suspended"].includes(applicationStatus)) throw Error("Unexpected application subscription status.");
  return Object.freeze({subscriptionReference: expected, subscriptionStatus: String(value.subscriptionStatus),
    ...(value.syncState ? {syncState: normalizeSyncState(value.syncState)} : {}),
    ...(typeof value.canCancelSubscription === "boolean" ? {canCancelSubscription: value.canCancelSubscription} : {}),
    ...(value.cancellation ? {cancellation: normalizeCancellation(value.cancellation)} : {}),
    ...(value.accessUntil ? {accessUntil: value.accessUntil} : {}),
    ...(value.firstChargeAt ? {firstChargeAt: value.firstChargeAt} : {}),
    ...(value.renewalRecovery?.version === 2 ? {canCancelPendingPayment: value.canCancelPendingPayment === true,
      canCancelRenewal: value.canCancelRenewal === true, renewalCancelled: value.renewalCancelled === true,
      recoveryPending: value.recoveryPending === true} : {}),
    applicationStatus, renewalRetry: normalizeRenewalRetry(value.renewalRetry),
    renewalRecovery: normalizeRenewalRecovery(value.renewalRecovery),
    currentCard: normalizeSavedCard(value.currentCard), canChangeCard: value.canChangeCard === true,
    nextChargeAt: value.nextChargeAt || null, cancelAtPeriodEnd: value.cancelAtPeriodEnd === true,
    studentId: String(value.studentId || "") || null, studentName: String(value.studentName || value.studentId || "") || null,
    canChangeAllStudents: value.canChangeAllStudents === true, cardChangeTargets: normalizeCardTargets(value.cardChangeTargets),
    cardUpdateResult: value.cardUpdateResult ? {scope: normalizeCardChangeScope(value.cardUpdateResult.scope),
      ...Object.fromEntries(["updated", "failed", "skipped"].map(key => [key,
        (value.cardUpdateResult[key] || []).map(normalizeSubscriptionReference)]))} : null,
    planId: String(value.planId || "") || null,
    paymentState: String(value.paymentState || "unavailable"),
    linkedInvoiceIsCurrent: value.linkedInvoiceIsCurrent === true,
    renewal: value.renewal ? normalizePaymentActionResult(value.renewal, expected) : null});
}
export class ManageStripeSubscriptionPayment {
  constructor(gateway) {this.gateway = gateway;}
  async getDetails(input) {
    const references = inputReferences(input);
    if (input.refreshFromStripe !== undefined) {
      if (typeof input.refreshFromStripe !== "boolean") throw Error("Invalid Stripe refresh option.");
      references.refreshFromStripe = input.refreshFromStripe;
    }
    return normalizePaymentDetails(await this.gateway.getSubscriptionPaymentDetails(references), references.subscriptionReference);
  }
  async updateCard(input) {
    const references = inputReferences(input);
    if (!/^seti_[a-zA-Z0-9_]+$/.test(input?.setupIntentReference || "")) throw Error("Invalid SetupIntent reference.");
    return normalizePaymentDetails(await this.gateway.updateSubscriptionPaymentMethod({
      ...references, setupIntentReference: input.setupIntentReference,
      ...(input.cardChangeScope === undefined ? {} : {cardChangeScope: normalizeCardChangeScope(input.cardChangeScope)})}), references.subscriptionReference);
  }
}
