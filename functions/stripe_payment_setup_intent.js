const {
  HttpsError,
  onCall,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  createPaymentProvider,
  paymentProviderSecrets,
} = require("./features/payment_factory/payment_factory_module");

const CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
  secrets: paymentProviderSecrets,
});

function requireAuthenticatedCaller(request) {
  if (!request?.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before creating a Stripe SetupIntent.",
    );
  }
}

function requireCustomerReference(request) {
  const customerReference = String(
    request?.data?.customerReference ?? "",
  ).trim();

  if (!customerReference) {
    throw new HttpsError(
      "invalid-argument",
      "customerReference is required.",
    );
  }

  return customerReference;
}

function createStripeSetupIntentHandlers({
  createProvider = createPaymentProvider,
} = {}) {
  async function createStripeSetupIntentHandler(request) {
    requireAuthenticatedCaller(request);
    const customerReference = requireCustomerReference(request);
    const paymentProvider = await createProvider();

    if (typeof paymentProvider?.createSetupIntent !== "function") {
      throw new Error(
        "The configured payment provider cannot create Stripe SetupIntents.",
      );
    }

    const clientSecret = String(
      await paymentProvider.createSetupIntent(customerReference),
    ).trim();

    if (!clientSecret) {
      throw new Error(
        "The payment provider did not return a client secret.",
      );
    }

    return clientSecret;
  }

  return Object.freeze({
    createStripeSetupIntentHandler,
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

      logger.error("Stripe SetupIntent creation failed.", {
        callerUid: request?.auth?.uid || null,
        errorMessage: error instanceof Error
          ? error.message
          : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        "Stripe SetupIntent creation failed.",
      );
    }
  };
}

const handlers = createStripeSetupIntentHandlers();
const createStripeSetupIntent = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(handlers.createStripeSetupIntentHandler),
);

module.exports = {
  createStripeSetupIntent,
  createStripeSetupIntentHandlers,
};
