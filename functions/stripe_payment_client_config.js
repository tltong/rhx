const {
  HttpsError,
  onCall,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  getPaymentConfig,
} = require("./features/payment/payment_module");
const {
  getStripePublishableKey,
  stripePublishableKeys,
} = require("./features/stripe_payment/stripe_payment_module");

const CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
  secrets: stripePublishableKeys,
});

function requireAuthenticatedCaller(request) {
  if (!request?.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before loading Stripe client configuration.",
    );
  }
}

function createStripePaymentClientConfigHandlers({
  loadPaymentConfig = getPaymentConfig,
  loadPublishableKey = getStripePublishableKey,
} = {}) {
  async function getStripeClientConfigHandler(request) {
    requireAuthenticatedCaller(request);
    const paymentConfig = await loadPaymentConfig();

    if (!paymentConfig) {
      throw new Error("Payment configuration is not available.");
    }

    if (paymentConfig.provider !== "stripe") {
      throw new Error(
        "The configured payment provider is not Stripe.",
      );
    }

    const mode = String(paymentConfig.mode ?? "").trim();
    const publishableKey = String(
      loadPublishableKey({mode}),
    ).trim();

    if (!publishableKey) {
      throw new Error(
        "The Stripe publishable key is not configured.",
      );
    }

    return {
      provider: "stripe",
      mode,
      publishableKey,
    };
  }

  return Object.freeze({
    getStripeClientConfigHandler,
  });
}

function withErrorLogging(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Stripe client configuration loading failed.", {
        callerUid: request?.auth?.uid || null,
        errorMessage: error instanceof Error
          ? error.message
          : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        "Stripe client configuration could not be loaded.",
      );
    }
  };
}

const handlers = createStripePaymentClientConfigHandlers();
const getStripeClientConfig = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(handlers.getStripeClientConfigHandler),
);

module.exports = {
  createStripePaymentClientConfigHandlers,
  getStripeClientConfig,
};
