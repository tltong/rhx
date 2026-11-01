const {timestamp, millis, sameScope, billingError} = require("./subscription_invoice");
const HOUR = 3600000;
const DATE_FIELDS = ["firstFailedAt", "graceUntil", "paidAt", "paidThrough", "nextActionAt", "leaseUntil", "completedAt"];

function recoveryData(value) {
  if (!value) return null;
  const result = {...value};
  for (const field of DATE_FIELDS) if (result[field] != null) result[field] = timestamp(result[field], field);
  return result;
}
function addBillingMonths(value, months) {
  const date = timestamp(value, "paidAt");
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw billingError("failed-precondition", "Recovery requires a fixed subscription period of 1–24 months.");
  }
  const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}
function observeRecovery(existing, invoice, {policy, eventType, eventCreatedAt, now}) {
  let recovery = recoveryData(existing);
  if (!recovery && policy?.gracePeriodHours !== undefined && ["invoice.payment_failed", "backend.renewal_recovery.initialize"].includes(eventType)
    && invoice.billingReason === "subscription_cycle" && invoice.isLatestInvoice
    && ["open", "paid"].includes(invoice.invoiceStatus)) {
    const firstFailedAt = new Date(Math.min(millis(eventCreatedAt), millis(now)));
    recovery = {version: 1, state: "pending_hold", firstFailedAt,
      graceUntil: new Date(millis(firstFailedAt) + policy.gracePeriodHours * HOUR),
      paidAt: null, paidThrough: null, nextActionAt: now, leaseToken: null, leaseUntil: null,
      completedAt: null, lastErrorCode: null};
  }
  if (!recovery || recovery.state === "completed") return recovery;
  if (invoice.paymentState === "paid") {
    const paidAt = timestamp(invoice.paidAt, "paidAt");
    if (recovery.paidAt && millis(recovery.paidAt) !== millis(paidAt)) {
      throw billingError("failed-precondition", "A verified recovery payment date cannot change.");
    }
    if (!Number.isInteger(invoice.durationMonths) || invoice.durationMonths < 1 || invoice.durationMonths > 24) {
      return {...recovery, state: "manual_review", paidAt, lastErrorCode: "unsupported_billing_period",
        nextActionAt: millis(now) < millis(recovery.graceUntil) ? recovery.graceUntil : null};
    }
    return {...recovery, state: "pending_reset", paidAt,
      paidThrough: addBillingMonths(paidAt, invoice.durationMonths),
      nextActionAt: recovery.leaseToken ? recovery.leaseUntil : now};
  }
  if (["void", "uncollectible"].includes(invoice.invoiceStatus)) {
    return {...recovery, state: "manual_review", lastErrorCode: "invoice_no_longer_payable", nextActionAt: null};
  }
  return recovery;
}
function publicRecovery(value, iso = false) {
  if (!value) return null;
  const result = {};
  for (const field of ["version", "state", "firstFailedAt", "graceUntil", "paidAt", "paidThrough", "completedAt", "lastErrorCode"]) {
    const v = value[field] ?? null;
    result[field] = iso && v && DATE_FIELDS.includes(field) ? timestamp(v, field).toISOString() : v;
  }
  return result;
}
function scopedRecovery(invoice) {
  return invoice.renewalRecovery ? {...publicRecovery(invoice.renewalRecovery),
    paymentProvider: invoice.paymentProvider, paymentMode: invoice.paymentMode,
    paymentSubscriptionReference: invoice.paymentSubscriptionReference, invoiceReference: invoice.invoiceReference} : null;
}
function recoveryOwns(student, invoice) {
  return !!student?.renewalRecovery && sameScope(student.renewalRecovery, invoice)
    && student.renewalRecovery.invoiceReference === invoice.invoiceReference;
}
module.exports = {recoveryData, observeRecovery, publicRecovery, scopedRecovery, recoveryOwns, addBillingMonths};
