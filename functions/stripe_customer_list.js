const {HttpsError, onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {isSiteAdmin} = require("./features/site_admin/site_admin_module");
const {
  normalizeSiteAdminEmail,
} = require("./features/site_admin/domain/site_admin_email");
const {getPaymentConfig} = require("./features/payment/payment_module");
const {
  listCustomerRecords,
} = require("./features/stripe_customer/stripe_customer_module");

function createListStripeCustomersHandler({
  checkAdmin = isSiteAdmin,
  loadConfig = getPaymentConfig,
  listCustomers = listCustomerRecords,
  log = logger,
} = {}) {
  return async (request) => {
    try {
      if (!request?.auth?.uid) {
        throw new HttpsError(
          "unauthenticated",
          "Sign in before listing Stripe customers.",
        );
      }

      let email;
      try {
        email = normalizeSiteAdminEmail(request.auth.token?.email);
      } catch (_error) {
        throw new HttpsError(
          "permission-denied",
          "A verified site administrator is required.",
        );
      }

      if (request.auth.token?.email_verified !== true
        || !await checkAdmin(email)) {
        throw new HttpsError(
          "permission-denied",
          "A verified site administrator is required.",
        );
      }

      const config = await loadConfig();
      if (config?.provider !== "stripe" || !["test", "prod"].includes(config.mode)) {
        throw new HttpsError(
          "failed-precondition",
          "Configure a Stripe payment mode before listing customers.",
        );
      }

      const records = await listCustomers({mode: config.mode});
      const customers = records.map((record) => ({
        customerReference: record.customerReference,
        email: record.email || null,
      })).sort((a, b) => {
        const firstLabel = a.email || a.customerReference;
        const secondLabel = b.email || b.customerReference;
        return firstLabel.localeCompare(secondLabel)
          || a.customerReference.localeCompare(b.customerReference);
      });

      return {mode: config.mode, customers};
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      log.error("Stripe customer listing failed.");
      throw new HttpsError("internal", "Stripe customers could not be loaded.");
    }
  };
}

const listStripeCustomers = onCall(
  {region: "us-central1"},
  createListStripeCustomersHandler(),
);
module.exports = {listStripeCustomers, createListStripeCustomersHandler};
