const {createHash} = require("node:crypto");
const {paymentModes, paymentProviders} = require("../../../schema/payment_config_schema");

const PAYMENT_STATES = new Set(["unpaid", "failed", "authentication_required", "processing", "paid", "unavailable"]);
function billingError(code, message) {return Object.assign(new Error(message), {code});}
function reference(value, name) {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || value.includes("/")) {
    throw billingError("invalid-argument", `${name} is invalid.`);
  }
  return value.trim();
}
function timestamp(value, name, optional = false) {
  if (value == null && optional) return null;
  const date = value instanceof Date ? value : value?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw billingError("invalid-argument", `${name} must be a valid timestamp.`);
  }
  return new Date(date.getTime());
}
function millis(value) {return value == null ? 0 : timestamp(value, "timestamp").getTime();}
function scope(input) {
  const result = {studentId: reference(input.studentId, "studentId"),
    paymentProvider: reference(input.paymentProvider, "paymentProvider"),
    paymentMode: reference(input.paymentMode, "paymentMode"),
    paymentSubscriptionReference: reference(input.paymentSubscriptionReference, "paymentSubscriptionReference")};
  if (!Object.values(paymentProviders).includes(result.paymentProvider)
    || !Object.values(paymentModes).includes(result.paymentMode)) {
    throw billingError("invalid-argument", "Unsupported payment provider or mode.");
  }
  return result;
}
function amount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw billingError("invalid-argument", `${name} must be non-negative minor units.`);
  return value;
}
function normalizeInvoice(input, now = new Date()) {
  const identity = scope(input), data = input.invoiceRecord || {};
  if (!PAYMENT_STATES.has(data.paymentState)) throw billingError("invalid-argument", "Unsupported payment state.");
  const result = {...identity,
    invoiceReference: reference(data.invoiceReference, "invoiceReference"),
    paymentCustomerReference: reference(data.paymentCustomerReference, "paymentCustomerReference"),
    guardianId: reference(data.guardianId, "guardianId"), planId: reference(data.planId, "planId"),
    billingReason: reference(data.billingReason, "billingReason"),
    subscriptionStatus: reference(data.subscriptionStatus, "subscriptionStatus"),
    invoiceStatus: reference(data.invoiceStatus, "invoiceStatus"),
    paymentIntentReference: data.paymentIntentReference == null ? null : reference(data.paymentIntentReference, "paymentIntentReference"),
    paymentIntentStatus: data.paymentIntentStatus == null ? null : reference(data.paymentIntentStatus, "paymentIntentStatus"),
    paymentState: data.paymentState,
    amountDue: amount(data.amountDue, "amountDue"), amountPaid: amount(data.amountPaid, "amountPaid"),
    amountRemaining: amount(data.amountRemaining, "amountRemaining"),
    currency: reference(data.currency, "currency").toLowerCase(), currencyExponent: data.currencyExponent,
    invoiceCreatedAt: timestamp(data.invoiceCreatedAt, "invoiceCreatedAt"),
    subscriptionRegisteredAt: timestamp(data.subscriptionRegisteredAt, "subscriptionRegisteredAt"),
    observedAt: timestamp(data.observedAt, "observedAt"),
    billingPeriodStart: timestamp(data.billingPeriodStart, "billingPeriodStart", true),
    billingPeriodEnd: timestamp(data.billingPeriodEnd, "billingPeriodEnd", true),
    durationMonths: data.durationMonths == null ? null : data.durationMonths,
    attemptCount: amount(data.attemptCount, "attemptCount"),
    nextPaymentAttemptAt: timestamp(data.nextPaymentAttemptAt, "nextPaymentAttemptAt", true),
    failureCode: data.failureCode == null ? null : reference(data.failureCode, "failureCode"),
    lastFailedAt: timestamp(data.lastFailedAt, "lastFailedAt", true),
    paidAt: timestamp(data.paidAt, "paidAt", true),
    isLatestInvoice: data.isLatestInvoice === true,
    createdAt: timestamp(now, "createdAt"), updatedAt: timestamp(now, "updatedAt"),
    accessAppliedAt: null,
  };
  if (!["draft", "open", "paid", "uncollectible", "void"].includes(result.invoiceStatus)) {
    throw billingError("invalid-argument", "Unsupported invoice status.");
  }
  if (!/^[a-z]{3}$/.test(result.currency) || !Number.isInteger(result.currencyExponent)
    || result.currencyExponent < 0 || result.currencyExponent > 4) throw billingError("invalid-argument", "Invalid invoice currency.");
  if (result.durationMonths !== null && (!Number.isInteger(result.durationMonths) || result.durationMonths < 1)) {
    throw billingError("invalid-argument", "Invalid invoice duration.");
  }
  if ((result.billingPeriodStart === null) !== (result.billingPeriodEnd === null)
    || (result.billingPeriodEnd && result.billingPeriodEnd <= result.billingPeriodStart)) {
    throw billingError("invalid-argument", "Invalid covered billing period.");
  }
  if (result.paymentState === "paid" && (result.invoiceStatus !== "paid" || result.amountRemaining !== 0 || !result.paidAt)) {
    throw billingError("invalid-argument", "Paid status requires a settled invoice and paid timestamp.");
  }
  if (result.invoiceStatus === "paid" && result.paymentState !== "paid") throw billingError("invalid-argument", "A paid invoice cannot be unpaid.");
  if (result.paymentState === "paid") result.nextPaymentAttemptAt = null;
  return result;
}
function documentKey(provider, mode, value) {
  return `${provider}_${mode}_${createHash("sha256").update(reference(value, "reference")).digest("hex")}`;
}
function sameScope(first, second) {
  return ["paymentProvider", "paymentMode", "paymentSubscriptionReference"].every(key => first?.[key] === second?.[key]);
}
function assertInvoiceIdentity(existing, invoice) {
  for (const key of ["studentId", "paymentProvider", "paymentMode", "paymentSubscriptionReference", "invoiceReference",
    "paymentCustomerReference", "guardianId", "planId", "currency"]) {
    if (existing[key] !== invoice[key]) throw billingError("failed-precondition", "Invoice identity cannot be changed.");
  }
}
module.exports = {scope, normalizeInvoice, documentKey, sameScope, assertInvoiceIdentity,
  reference, timestamp, millis, billingError};
