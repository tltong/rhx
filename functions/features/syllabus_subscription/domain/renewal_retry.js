const {timestamp, millis, billingError} = require("./subscription_invoice");

const HOUR = 60 * 60 * 1000;
const CHECK_INTERVAL = 5 * 60 * 1000;
const LEASE_DURATION = 10 * 60 * 1000;
const REPLAY_LIMIT = 23 * HOUR;
const TERMINAL = new Set(["completed", "exhausted", "stopped"]);
const RETRY_DATE_FIELDS = ["firstFailedAt", "graceUntil", "nextAttemptAt", "nextActionAt",
  "lastAttemptAt", "completedAt", "exhaustedAt", "leaseUntil", "attemptStartedAt"];

function retryData(data) {
  if (!data) return null;
  const result = {...data};
  for (const key of RETRY_DATE_FIELDS) if (result[key] != null) result[key] = timestamp(result[key], key);
  return result;
}
function policySnapshot(policy) {
  if (!policy || !Number.isInteger(policy.maxRetries) || policy.maxRetries < 0 || policy.maxRetries > 10
    || !Number.isInteger(policy.intervalHours) || policy.intervalHours < 1 || policy.intervalHours > 168) {
    throw billingError("invalid-argument", "Invalid renewal retry policy.");
  }
  if (policy.gracePeriodHours !== undefined && (!Number.isInteger(policy.gracePeriodHours)
    || policy.gracePeriodHours < 1 || policy.gracePeriodHours > 1680)) throw billingError("invalid-argument", "Invalid suspension grace period.");
  return {maxRetries: policy.maxRetries, intervalHours: policy.intervalHours,
    ...(policy.gracePeriodHours === undefined ? {} : {gracePeriodHours: policy.gracePeriodHours})};
}
function clearLease(plan) {return {...plan, leaseToken: null, leaseUntil: null};}
function clearAttempt(plan) {
  return {...plan, attemptReference: null, attemptStartedAt: null, attemptPaymentMethodReference: null};
}
function exhaust(plan, now, reason = "retry_limit_reached") {
  if (plan.gracePeriodHours !== undefined && millis(now) < millis(plan.graceUntil)) {
    return {...clearAttempt(clearLease(plan)), state: "awaiting_action", nextAttemptAt: null,
      nextActionAt: plan.graceUntil, lastOutcome: reason};
  }
  return {...clearAttempt(clearLease(plan)), state: "exhausted", nextAttemptAt: null, nextActionAt: null,
    exhaustedAt: plan.exhaustedAt || now, lastOutcome: reason};
}
function observeRetry(existing, invoice, {policy, eventType, eventCreatedAt, now}) {
  let plan = retryData(existing);
  if (!plan && policy && ["invoice.payment_failed", "backend.renewal_recovery.initialize"].includes(eventType)
    && invoice.billingReason === "subscription_cycle" && invoice.isLatestInvoice
    && invoice.invoiceStatus === "open" && ["failed", "authentication_required"].includes(invoice.paymentState)) {
    const snapshot = policySnapshot(policy);
    const firstFailedAt = new Date(Math.min(millis(eventCreatedAt), millis(now)));
    const firstDue = new Date(millis(firstFailedAt) + snapshot.intervalHours * HOUR);
    plan = {...snapshot, state: "scheduled", attemptsMade: 0, firstFailedAt,
      graceUntil: new Date(millis(firstFailedAt) + (snapshot.gracePeriodHours ?? snapshot.maxRetries * snapshot.intervalHours) * HOUR),
      nextAttemptAt: firstDue, nextActionAt: firstDue, lastAttemptAt: null, lastOutcome: "initial_payment_failed",
      completedAt: null, exhaustedAt: null, leaseToken: null, leaseUntil: null,
      attemptReference: null, attemptStartedAt: null, attemptPaymentMethodReference: null};
    if (!snapshot.maxRetries || millis(now) > millis(plan.graceUntil)) plan = exhaust(plan, now, "retry_period_ended");
    else if (snapshot.gracePeriodHours !== undefined && firstDue > plan.graceUntil) {
      plan = {...plan, state: "awaiting_action", nextAttemptAt: null, nextActionAt: plan.graceUntil};
    }
  }
  if (!plan) return null;
  if (invoice.paymentState === "paid") {
    return {...clearAttempt(clearLease(plan)), state: "completed", nextAttemptAt: null, nextActionAt: null,
      completedAt: plan.completedAt || now, lastOutcome: "paid"};
  }
  if (TERMINAL.has(plan.state)) return plan;
  if (invoice.invoiceStatus !== "open" || !invoice.isLatestInvoice
    || ["canceled", "incomplete_expired"].includes(invoice.subscriptionStatus)) {
    return {...clearAttempt(clearLease(plan)), state: "stopped", nextAttemptAt: null,
      nextActionAt: null, lastOutcome: "invoice_no_longer_recoverable"};
  }
  // A worker owns any in-flight attempt. A failure webhook never reserves or
  // counts a second attempt; a paid webhook can always complete the plan above.
  if (plan.leaseToken) return plan;
  if (invoice.paymentState === "processing") {
    return {...plan, state: "processing", nextAttemptAt: null,
      nextActionAt: new Date(millis(now) + CHECK_INTERVAL), lastOutcome: "processing"};
  }
  if (invoice.paymentState === "authentication_required") {
    return millis(now) >= millis(plan.graceUntil) ? exhaust(plan, now, "authentication_required")
      : {...plan, state: "awaiting_action", nextAttemptAt: null, nextActionAt: plan.graceUntil,
        lastOutcome: "authentication_required"};
  }
  return plan;
}
function claimRetry(plan, token, now) {
  if (!plan || TERMINAL.has(plan.state) || !plan.nextActionAt || millis(plan.nextActionAt) > millis(now)) return null;
  if (plan.leaseToken && millis(plan.leaseUntil) > millis(now)) return null;
  return {...plan, state: "leased", leaseToken: token,
    leaseUntil: new Date(millis(now) + LEASE_DURATION), nextActionAt: new Date(millis(now) + LEASE_DURATION)};
}
function beginAttempt(plan, {token, paymentMethodReference, attemptReference, now}) {
  if (plan.leaseToken !== token || millis(plan.leaseUntil) <= millis(now)) return null;
  if (plan.attemptReference) return plan;
  if (plan.attemptsMade >= plan.maxRetries) return null;
  return {...plan, attemptsMade: plan.attemptsMade + 1, attemptReference,
    attemptStartedAt: now, lastAttemptAt: now, attemptPaymentMethodReference: paymentMethodReference};
}
function finishRetry(plan, {token, outcome, reason, nextAttemptAt, now}) {
  if (!plan || plan.leaseToken !== token) return null;
  const free = clearLease(plan);
  if (outcome === "defer") {
    const next = timestamp(nextAttemptAt, "nextAttemptAt");
    if (millis(next) <= millis(now)) throw billingError("invalid-argument", "A deferred attempt must be in the future.");
    return {...free, state: "scheduled", nextAttemptAt: next, nextActionAt: next};
  }
  if (outcome === "processing" || outcome === "error") {
    return {...free, state: "processing", nextAttemptAt: null,
      nextActionAt: new Date(millis(now) + CHECK_INTERVAL), lastOutcome: reason || outcome};
  }
  if (outcome === "exhausted") return exhaust(plan, now, reason);
  if (outcome === "stopped") {
    return {...clearAttempt(free), state: "stopped", nextAttemptAt: null, nextActionAt: null, lastOutcome: reason || "stopped"};
  }
  if (outcome === "awaiting_action") {
    return millis(now) >= millis(plan.graceUntil) ? exhaust(plan, now, reason || "payment_method_required")
      : {...clearAttempt(free), state: "awaiting_action", nextAttemptAt: null,
        nextActionAt: plan.graceUntil, lastOutcome: reason || "payment_method_required"};
  }
  if (outcome !== "failed") throw billingError("invalid-argument", "Unknown retry outcome.");
  if (plan.attemptsMade >= plan.maxRetries) return exhaust(plan, now);
  const next = new Date(millis(now) + plan.intervalHours * HOUR);
  if (plan.gracePeriodHours !== undefined && next > plan.graceUntil) {
    return {...clearAttempt(free), state: "awaiting_action", nextAttemptAt: null,
      nextActionAt: plan.graceUntil, lastOutcome: reason || "payment_failed"};
  }
  return {...clearAttempt(free), state: "scheduled", nextAttemptAt: next, nextActionAt: next,
    graceUntil: plan.gracePeriodHours === undefined
      ? new Date(millis(next) + (plan.maxRetries - plan.attemptsMade - 1) * plan.intervalHours * HOUR) : plan.graceUntil,
    lastOutcome: reason || "payment_failed"};
}
function publicRetry(plan, iso = false) {
  if (!plan) return null;
  const result = {};
  for (const key of ["state", "maxRetries", "intervalHours", "attemptsMade", "firstFailedAt", "graceUntil",
    "nextAttemptAt", "lastAttemptAt", "lastOutcome", "completedAt", "exhaustedAt"]) {
    const value = plan[key] ?? null;
    result[key] = iso && value && RETRY_DATE_FIELDS.includes(key) ? timestamp(value, key).toISOString() : value;
  }
  return result;
}
module.exports = {observeRetry, retryData, policySnapshot, claimRetry, beginAttempt, finishRetry,
  publicRetry, TERMINAL, REPLAY_LIMIT, CHECK_INTERVAL};
