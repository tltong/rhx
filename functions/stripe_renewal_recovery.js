const {onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {paymentProviderSecrets} = require("./features/payment_factory/payment_factory_module");
const {normalizePaymentDetails} = require("./stripe_payment_subscription");
const {manageStripeRenewalRecovery} = require("./features/stripe_payment_subscription/stripe_payment_subscription_module");
function identifier(value, name) {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || value.includes("/")) throw new HttpsError("invalid-argument", `Invalid ${name}.`);
  return value.trim();
}
function createRenewalRecoveryHandler({manage = manageStripeRenewalRecovery} = {}) {
  return async request => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in with your guardian account.");
    const data = request.data || {}, subscriptionReference = identifier(data.subscriptionReference, "subscriptionReference");
    if (!/^sub_[\w]+$/.test(subscriptionReference) || !["retry", "new_card", "cancel_payment", "cancel_renewal", "cancel_subscription"].includes(data.action)) {
      throw new HttpsError("invalid-argument", "Invalid renewal recovery action.");
    }
    const input = {internalReference: request.auth.uid, subscriptionReference, action: data.action};
    for (const key of ["invoiceReference", "planId", "quoteReference"]) if (data[key] !== undefined) input[key] = identifier(data[key], key);
    if (["retry", "new_card"].includes(input.action)) input.idempotencyReference = identifier(data.idempotencyReference, "idempotencyReference");
    try {return normalizePaymentDetails(await manage(input), subscriptionReference);}
    catch (err) {
      if (["invalid-argument", "permission-denied", "not-found", "failed-precondition", "unavailable"].includes(err.code)) throw new HttpsError(err.code, err.message);
      logger.error("Renewal recovery request needs reconciliation.", {action: input.action, callerUid: request.auth.uid, code: err.code || null});
      throw new HttpsError("unavailable", "The payment result is not confirmed. Check payment status before trying again.");
    }
  };
}
module.exports = {createRenewalRecoveryHandler,
  manageStripeRenewalRecovery: onCall({region: "us-central1", timeoutSeconds: 300, secrets: paymentProviderSecrets}, createRenewalRecoveryHandler())};
