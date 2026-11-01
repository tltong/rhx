const RECOVERABLE_STATUSES = new Set(["active", "past_due", "unpaid", "incomplete"]);
const REPLACE_CARD_CODES = new Set([
  "expired_card", "lost_card", "stolen_card", "pickup_card",
  "revocation_of_authorization", "revocation_of_all_authorizations",
]);
const SAFE_FAILURE_CODES = new Set([
  ...REPLACE_CARD_CODES, "insufficient_funds", "card_declined",
  "authentication_required", "payment_intent_authentication_failure",
  "processing_error", "try_again_later", "do_not_honor",
]);

function paymentError(code, message) {
  return Object.assign(new Error(message), {code});
}

function requireStripeReference(value, prefix, fieldName) {
  if (typeof value !== "string"
    || !new RegExp(`^${prefix}[a-zA-Z0-9_]+$`).test(value.trim())) {
    throw paymentError("invalid-argument", `${fieldName} is invalid.`);
  }
  return value.trim();
}

function safeFailureCode(value) {
  return SAFE_FAILURE_CODES.has(value) ? value : value ? "card_declined" : null;
}

async function selectedSubscriptionInvoice({subscription, student, mode, paymentProvider}) {
  const recovery = student?.renewalRecovery;
  if (!recovery || recovery.paymentMode !== mode || recovery.paymentSubscriptionReference !== subscription.subscriptionReference) {
    const summary = student?.billingSummary;
    return summary?.paymentMode === mode && summary.paymentSubscriptionReference === subscription.subscriptionReference
      && summary.renewalRetry && summary.paymentState !== "paid" ? summary.invoiceReference : subscription.latestInvoiceReference;
  }
  if (recovery.state !== "completed" || !subscription.latestInvoiceReference
    || subscription.latestInvoiceReference === recovery.invoiceReference) return recovery.invoiceReference;
  const latest = await paymentProvider.retrieveInvoicePaymentContext(subscription.latestInvoiceReference, {includeBillingDetails: true});
  if (latest.customerReference !== subscription.customerReference || latest.subscriptionReference !== subscription.subscriptionReference) {
    throw paymentError("failed-precondition", "Unexpected current invoice owner.");
  }
  const until = recovery.paidThrough instanceof Date ? recovery.paidThrough : recovery.paidThrough?.toDate?.();
  return latest.billingReason === "subscription_cycle" && (latest.invoiceCreatedAt >= until || latest.billingPeriodStart >= until)
    ? latest.invoiceReference : recovery.invoiceReference;
}

async function loadOwnedStripeSubscription(dependencies, input = {}) {
  const internalReference = String(input.internalReference ?? "").trim();
  if (!internalReference) {
    throw paymentError("unauthenticated", "Sign in to access this payment.");
  }
  const subscriptionReference = requireStripeReference(
    input.subscriptionReference, "sub_", "subscriptionReference",
  );
  const {providerName, mode, paymentProvider} =
    await dependencies.createPaymentProviderContext();
  if (providerName !== "stripe") {
    throw paymentError("failed-precondition", "Stripe payments are unavailable.");
  }
  // Check ownership before looking up any client-supplied Stripe resource.
  const customer = await dependencies.getCustomerRecordByInternalReference({
    mode, internalReference,
  });
  const record = customer && await dependencies.getSubscriptionRecord({
    mode, customerReference: customer.customerReference, subscriptionReference,
  });
  if (!record) {
    throw paymentError("not-found", "This subscription is unavailable.");
  }
  const subscription = await paymentProvider.retrieveSubscription(
    subscriptionReference, {includeRecoveryDetails: true},
  );
  if (subscription.subscriptionReference !== subscriptionReference
    || subscription.customerReference !== customer.customerReference) {
    throw new Error("Stripe returned an unexpected subscription owner.");
  }
  const student = record.studentId && dependencies.getStudentSubscription ? await dependencies.getStudentSubscription(record.studentId) : null;
  const selectedInvoiceReference = await selectedSubscriptionInvoice({subscription, student, mode, paymentProvider});
  return {paymentProvider, mode, internalReference,
    record: require("./billing_plan_version").subscriptionBillingRecord(record, subscription), subscription, customer, student,
    selectedInvoiceReference, subscriptionReference};
}

async function loadOwnedSubscriptionInvoice(dependencies, input = {}, owned = null) {
  const {paymentProvider, mode, internalReference, record, subscription, customer, selectedInvoiceReference, student,
    subscriptionReference} = owned || await loadOwnedStripeSubscription(dependencies, input);
  const requestedInvoice = input.invoiceReference == null ? null
    : requireStripeReference(input.invoiceReference, "in_", "invoiceReference");
  // Failed-renewal webhook data may be stale; use Stripe's live latest invoice.
  const invoiceReference = requestedInvoice || selectedInvoiceReference;
  if (!invoiceReference) {
    throw paymentError("failed-precondition", "No invoice is available yet.");
  }
  const context = await paymentProvider.retrieveInvoicePaymentContext(
    invoiceReference, {includeRecoveryDetails: true,
      ...(input.paymentMethodChoice === "new_card" ? {includeCardPaymentSecret: true} : {})},
  );
  if (context.invoiceReference !== invoiceReference
    || context.subscriptionReference !== subscriptionReference
    || context.customerReference !== customer.customerReference) {
    throw paymentError("not-found", "This invoice is unavailable.");
  }
  if (!Number.isSafeInteger(context.amountRemaining)
    || context.amountRemaining < 0 || !/^[a-z]{3}$/i.test(context.currency)) {
    throw new Error("Stripe returned invalid invoice billing details.");
  }
  const requiresReview = student?.renewalRecovery?.state === "manual_review"
    && student.renewalRecovery.paymentMode === mode
    && student.renewalRecovery.paymentSubscriptionReference === subscriptionReference;
  const eligible = !requiresReview && RECOVERABLE_STATUSES.has(subscription.status)
    && !(student?.subscriptionCancellation?.paymentMode === mode
      && student.subscriptionCancellation.paymentSubscriptionReference === subscriptionReference)
    && (!subscription.paused || (subscription.billingHoldManaged && subscription.recoveryInvoiceReference === invoiceReference)) && subscription.collectionMethod === "charge_automatically"
    && context.collectionMethod === "charge_automatically"
    && invoiceReference === selectedInvoiceReference
    && context.invoiceStatus === "open" && context.amountRemaining > 0;
  const paymentMethodReference = subscription.defaultPaymentMethodReference
    || context.defaultPaymentMethodReference || null;
  let savedCard = null;
  if (eligible && paymentMethodReference) {
    let method;
    try { method = await paymentProvider.retrievePaymentMethod(paymentMethodReference); }
    catch (error) {if (error?.code !== "resource_missing") throw error;}
    if (method && (method.paymentMethodReference !== paymentMethodReference
      || (method.customerReference && method.customerReference !== customer.customerReference))) {
      throw paymentError("failed-precondition", "The saved card is unavailable.");
    }
    if (method?.customerReference && method.type === "card" && method.card
      && /^\d{4}$/.test(method.card.last4)
      && Number.isInteger(method.card.expiryMonth)
      && method.card.expiryMonth >= 1 && method.card.expiryMonth <= 12
      && Number.isInteger(method.card.expiryYear)) {
      savedCard = Object.freeze({
        brand: String(method.card.brand), last4: method.card.last4,
        expiryMonth: method.card.expiryMonth, expiryYear: method.card.expiryYear,
      });
    }
  }
  return {paymentProvider, mode, internalReference, record, subscription, customer,
    context, eligible, paymentMethodReference, savedCard, selectedInvoiceReference};
}

function recoveryResult(loaded, failureCode = loaded.context.failureCode) {
  const {context, subscription, eligible, savedCard} = loaded;
  let action = "unavailable";
  const failure = safeFailureCode(failureCode);
  const canPayWithNewCard = eligible && context.billingReason === "subscription_cycle"
    && context.paymentAttempted && subscription.status !== "incomplete"
    && subscription.saveDefaultPaymentMethod === "on_subscription"
    && !!context.paymentIntentReference
    && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(context.paymentStatus);
  // A succeeded PaymentIntent alone does not prove this invoice is settled.
  if (context.invoiceStatus === "paid") {
    action = "complete";
  } else if (context.invoiceStatus === "open"
    && ["processing", "succeeded"].includes(context.paymentStatus)) {
    action = "wait";
  } else if (eligible && context.paymentStatus === "requires_action") {
    if (!context.paymentClientSecret) {
      throw new Error("Stripe did not return the authentication client secret.");
    }
    action = "confirm_payment";
  } else if (eligible && subscription.status === "incomplete" && context.billingReason === "subscription_create"
    && context.paymentStatus === "requires_confirmation" && savedCard
    && context.paymentMethodReference === loaded.paymentMethodReference) {
    if (!context.paymentClientSecret) throw Error("Stripe did not return the initial payment confirmation secret.");
    action = "confirm_payment";
  } else if (eligible && context.billingReason === "subscription_cycle"
    && context.paymentAttempted && subscription.status !== "incomplete") {
    const cardChangedSinceFailure = context.failedPaymentMethodReference
      && context.failedPaymentMethodReference !== loaded.paymentMethodReference;
    action = savedCard && (!REPLACE_CARD_CODES.has(failure) || cardChangedSinceFailure)
      && [null, "requires_payment_method", "requires_confirmation"].includes(
        context.paymentStatus,
      ) ? "retry_payment" : "replace_payment_method";
  } else if (eligible && context.paymentStatus === "requires_payment_method") {
    action = "replace_payment_method";
  }
  return Object.freeze({
    action, subscriptionReference: subscription.subscriptionReference,
    invoiceReference: context.invoiceReference,
    invoiceStatus: context.invoiceStatus, subscriptionStatus: subscription.status,
    billingReason: context.billingReason || null,
    canPayWithNewCard,
    paymentState: invoicePaymentState(context, subscription, failure),
    nextPaymentAttemptAt: context.nextPaymentAttemptAt || null,
    paymentStatus: context.paymentStatus,
    paymentClientSecret: action === "confirm_payment" ? context.paymentClientSecret : null,
    amountDue: context.amountRemaining, currency: context.currency.toLowerCase(),
    canRetry: action === "retry_payment", savedCard,
    failureCode: failure,
    studentId: loaded.record.studentId || null, planId: loaded.record.planId || null,
  });
}

function invoicePaymentState(context, subscription, failure) {
  if (context.invoiceStatus === "paid") return "paid";
  if (context.invoiceStatus !== "open") return "unavailable";
  if (["processing", "succeeded"].includes(context.paymentStatus)) return "processing";
  if (context.paymentStatus === "requires_action") return "authentication_required";
  if (context.paymentAttempted && (failure
    || ["past_due", "unpaid"].includes(subscription.status))) return "failed";
  return "unpaid";
}

module.exports = {selectedSubscriptionInvoice, loadOwnedStripeSubscription, loadOwnedSubscriptionInvoice, recoveryResult,
  requireStripeReference, paymentError};
