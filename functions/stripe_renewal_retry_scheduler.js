const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {paymentProviderSecrets} = require("./features/payment_factory/payment_factory_module");
const {processDueStripeRenewalRetries} = require("./features/stripe_payment_subscription/stripe_payment_subscription_module");

// A protected Cloud Scheduler invocation; the guardian page never drives timers.
const retryStripeRenewals = onSchedule({schedule: "every 5 minutes", timeZone: "Etc/UTC",
  region: "us-central1", timeoutSeconds: 300, maxInstances: 1, retryCount: 0,
  secrets: paymentProviderSecrets}, async () => {
  const result = await processDueStripeRenewalRetries({limit: 25});
  if (result.errors) logger.warn("Some renewal retries need reconciliation.", result);
  else logger.info("Renewal retry sweep completed.", result);
  return result;
});
module.exports = {retryStripeRenewals};
