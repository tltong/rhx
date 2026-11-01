function toDate(value) {return value instanceof Date ? value : value?.toDate?.();}
function invoiceRecord({context, subscription, registered, customer, observedAt,
  eventType = null, eventCreatedAt = null, selectedInvoiceReference = subscription.latestInvoiceReference}) {
  registered = require("./billing_plan_version").invoiceBillingRecord(registered, context);
  let paymentState = "unavailable";
  if (context.invoiceStatus === "paid") paymentState = "paid";
  else if (context.invoiceStatus === "open") {
    if (["processing", "succeeded"].includes(context.paymentStatus)) paymentState = "processing";
    else if (context.paymentStatus === "requires_action") paymentState = "authentication_required";
    else if (context.paymentAttempted && (context.failureCode
      || ["past_due", "unpaid"].includes(subscription.status))) paymentState = "failed";
    else paymentState = "unpaid";
  }
  const failureCode = typeof context.failureCode === "string" && /^[a-z0-9_]{1,100}$/.test(context.failureCode)
    ? context.failureCode : null;
  return {
    invoiceReference: context.invoiceReference, paymentCustomerReference: context.customerReference,
    guardianId: customer.internalReference, planId: registered.planId,
    billingReason: registered.billingStartsAt && context.billingReason === "subscription_create" && context.amountDue === 0
      ? "prepaid_bridge" : context.billingReason || "unknown", subscriptionStatus: subscription.status,
    invoiceStatus: context.invoiceStatus, paymentIntentReference: context.paymentIntentReference,
    paymentIntentStatus: context.paymentStatus, paymentState,
    amountDue: context.amountDue, amountPaid: context.amountPaid, amountRemaining: context.amountRemaining,
    currency: context.currency, currencyExponent: context.currencyExponent,
    invoiceCreatedAt: context.invoiceCreatedAt,
    subscriptionRegisteredAt: toDate(registered.createdAt) || subscription.subscriptionStartDate,
    observedAt, billingPeriodStart: context.billingPeriodStart, billingPeriodEnd: context.billingPeriodEnd,
    durationMonths: registered.interval === "month" ? registered.intervalCount
      : registered.interval === "year" ? registered.intervalCount * 12 : null,
    attemptCount: context.attemptCount,
    nextPaymentAttemptAt: context.nextPaymentAttemptAt ? new Date(context.nextPaymentAttemptAt) : null,
    failureCode,
    lastFailedAt: paymentState === "failed" && eventType === "invoice.payment_failed" ? eventCreatedAt : null,
    paidAt: context.paidAt,
    isLatestInvoice: selectedInvoiceReference === context.invoiceReference,
  };
}
module.exports = {invoiceRecord};
