const {createHash} = require("node:crypto");
const {hydrate} = require("./renewal_episode");
const id = input => createHash("sha256").update(JSON.stringify([input.mode, input.subscriptionReference])).digest("hex");
const error = (message, code = "failed-precondition") => Object.assign(Error(message), {code});
const iso = value => value == null ? null : new Date(value?.toDate?.() || value).toISOString();
const card = value => value ? Object.fromEntries(["brand", "last4", "expiryMonth", "expiryYear"].map(k => [k, value[k]])) : null;
const metadata = Symbol.for("rhx.subscription.paymentView");
function withMetadata(details, subscription) {
  const result = {...details};
  if (subscription) Object.defineProperty(result, metadata, {value: {subscription, paymentMethodReference: subscription.defaultPaymentMethodReference || null}});
  return Object.freeze(result);
}
function sanitize(details) {
  const keys = ["subscriptionReference", "subscriptionStatus", "applicationStatus", "canChangeCard", "nextChargeAt", "firstChargeAt",
    "cancelAtPeriodEnd", "studentId", "studentName", "planId", "paymentState", "linkedInvoiceIsCurrent", "canCancelSubscription", "accessUntil",
    "canCancelPendingPayment", "canCancelRenewal", "renewalCancelled", "recoveryPending"];
  const result = Object.fromEntries(keys.filter(k => details[k] !== undefined).map(k => [k, details[k]]));
  result.currentCard = card(details.currentCard);
  for (const [name, fields] of [
    ["renewalRetry", ["state", "maxRetries", "intervalHours", "attemptsMade", "firstFailedAt", "graceUntil", "nextAttemptAt", "lastAttemptAt", "lastOutcome", "completedAt", "exhaustedAt"]],
    ["renewalRecovery", ["version", "state", "firstFailedAt", "graceUntil", "paidAt", "paidThrough", "completedAt", "lastErrorCode"]],
    ["cancellation", ["state", "requestedAt", "cancelledAt", "accessUntil"]],
  ]) result[name] = details[name] ? Object.fromEntries(fields.map(k => [k, details[name][k] ?? null])) : null;
  if (details.renewal) {
    const fields = ["action", "subscriptionReference", "invoiceReference", "attemptInvoiceReference", "invoiceStatus", "subscriptionStatus", "billingReason",
      "paymentState", "paymentStatus", "amountDue", "amountPaid", "currency", "canRetry", "canPayWithNewCard", "failureCode", "requiresNewCard",
      "studentId", "planId", "nextPaymentAttemptAt"];
    result.renewal = Object.fromEntries(fields.filter(k => details.renewal[k] !== undefined).map(k => [k, details.renewal[k]]));
    result.renewal.savedCard = card(details.renewal.savedCard);
    result.renewal.paymentClientSecret = null;
    result.renewal.requiresActionFetch = ["confirm_payment", "enter_new_card"].includes(result.renewal.action);
  } else result.renewal = null;
  return JSON.parse(JSON.stringify(result));
}
function billingSnapshot(subscription = {}) {
  const keys = ["status", "collectionMethod", "currentPriceReference", "scheduleReference", "saveDefaultPaymentMethod", "paused", "recoveryState", "cancelAtPeriodEnd"];
  return {...Object.fromEntries(keys.filter(k => subscription[k] !== undefined).map(k => [k, subscription[k]])),
    currentPeriodStart: iso(subscription.currentPeriodStart), currentPeriodEnd: iso(subscription.currentPeriodEnd)};
}
function dueAt(payload, now) {
  if (!payload || payload.cancellation?.state === "pending" || payload.recoveryPending
    || ["processing", "authentication_required"].includes(payload.paymentState) || payload.subscriptionStatus === "incomplete") return new Date(+now + 300000);
  const next = payload.nextChargeAt || payload.firstChargeAt;
  return next && ["active", "trialing"].includes(payload.subscriptionStatus) ? new Date(Math.max(+now + 120000, +new Date(next) + 120000)) : null;
}
module.exports = {id, error, hydrate, iso, card, sanitize, billingSnapshot, dueAt, metadata, withMetadata};
