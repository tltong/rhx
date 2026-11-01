// Compatibility for existing checkout callers. Subscription logic lives in
// stripe_payment_subscription; new callers should use that feature's module.
export {GetStripeSubscriptionPaymentAction, normalizePaymentActionResult,
  normalizeInvoiceReference, normalizeSubscriptionReference, normalizeSavedCard}
  from "../../stripe_payment_subscription/application/get_subscription_payment_action.js?v=20261101-stored-status-v1";
