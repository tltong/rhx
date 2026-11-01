const {createHash} = require("node:crypto");
const {addBillingMonths} = require("./renewal_recovery");
const HOUR = 3600000;
// A fixed rollout boundary prevents delayed historical webhooks from enrolling
// old debt. Existing invoice-ledger records are also excluded at initialization.
const RECOVERY_START_AT = new Date(process.env.RENEWAL_RECOVERY_START_AT || "2026-10-31T11:45:00.000Z");
if (!Number.isFinite(+RECOVERY_START_AT)) throw Error("RENEWAL_RECOVERY_START_AT must be a valid UTC timestamp.");
const HARD_DECLINES = new Set(["expired_card", "lost_card", "stolen_card", "pickup_card",
  "revocation_of_authorization", "revocation_of_all_authorizations", "closed_account",
  "invalid_account", "invalid_number", "incorrect_number", "card_not_supported"]);
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const date = value => value?.toDate?.() || (typeof value === "string" ? new Date(value) : value);
const error = (message, code = "failed-precondition") => Object.assign(Error(message), {code});
function hydrate(value) {
  if (value == null) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(hydrate);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hydrate(v)]));
  return value;
}
function manualReason(code) {
  return HARD_DECLINES.has(code) ? "new_card_required"
    : ["authentication_required", "payment_intent_authentication_failure"].includes(code) ? "authentication_required" : null;
}
function recoveryProjection(e) {
  return {version: 2, episodeReference: e.id, state: e.state, firstFailedAt: e.firstFailedAt,
    graceUntil: e.graceUntil, paidAt: e.paidAt || null, paidThrough: e.paidThrough || null,
    invoiceReference: e.completedInvoiceReference || e.originalInvoiceReference,
    paymentProvider: "stripe", paymentMode: e.mode, paymentSubscriptionReference: e.subscriptionReference,
    completedAt: e.completedAt || null, lastErrorCode: e.lastErrorCode || null};
}
function retryProjection(e) {
  return {state: e.state === "completed" ? "completed" : e.cancelledAt ? "stopped"
    : e.attempt && !["failed", "cancelled", "completed"].includes(e.attempt.state) ? "processing"
      : e.nextRetryAt ? "scheduled" : "awaiting_action",
  maxRetries: e.policy.maxRetries, intervalHours: e.policy.intervalHours, attemptsMade: e.attemptsMade,
  firstFailedAt: e.firstFailedAt, graceUntil: e.graceUntil, nextAttemptAt: e.nextRetryAt || null,
  lastAttemptAt: e.lastAttemptAt || null, lastOutcome: e.reason || "payment_failed",
  completedAt: e.completedAt || null, exhaustedAt: e.exhaustedAt || null};
}
function nextAction(e, now) {
  if (e.state === "completed") return null;
  if (e.state === "pending_hold" || e.state === "pending_reset" || e.leaseToken) return new Date(+now + 300000);
  if (e.state === "manual_review") return now < e.graceUntil ? e.graceUntil : null;
  const pending = e.attempt && !["failed", "cancelled", "completed"].includes(e.attempt.state);
  const dates = [pending ? new Date(+now + 300000) : null,
    now < e.graceUntil ? e.graceUntil : (!e.originalDropped || !e.expiryApplied ? now : null),
    !pending && !e.cancelledAt && e.nextRetryAt && e.nextRetryAt < e.graceUntil ? e.nextRetryAt : null].filter(Boolean);
  return dates.length ? new Date(Math.min(...dates.map(Number))) : null;
}
function failAttempt(e, code, now) {
  e.lastErrorCode = null;
  e.reason = manualReason(code) || code || "payment_failed";
  e.attempt.state = "failed"; e.attempt.finishedAt = now;
  e.state = now >= e.graceUntil ? "suspended" : "held";
  if (manualReason(code)) {
    e.automaticStoppedReason = manualReason(code);
    if (e.automaticStoppedReason === "new_card_required") e.blockedPaymentMethodReference = e.attempt.paymentMethodReference || e.blockedPaymentMethodReference || null;
  }
  if (e.cancelledAt || e.automaticStoppedReason || e.attemptsMade >= e.policy.maxRetries) e.nextRetryAt = null;
  else if (e.attempt.kind === "automatic") e.nextRetryAt = new Date(+now + e.policy.intervalHours * HOUR);
  if (e.nextRetryAt >= e.graceUntil) e.nextRetryAt = null;
}
module.exports = {HOUR, RECOVERY_START_AT, HARD_DECLINES, hash, date, error, hydrate,
  manualReason, recoveryProjection, retryProjection, nextAction, failAttempt, addBillingMonths};
