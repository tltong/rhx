const {cardChangeScope} = require("./features/stripe_payment_subscription/application/card_change_scope");
const {
  HttpsError,
  onCall,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  paymentProviderSecrets,
} = require("./features/payment_factory/payment_factory_module");
const {
  createStripePaymentSetupIntent,
} = require(
  "./features/stripe_payment_customer/stripe_payment_customer_module"
);
const {createStripeSubscriptionCardSetup} =
  require("./features/stripe_payment_subscription/stripe_payment_subscription_module");

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
  createPaymentSetupIntent = createStripePaymentSetupIntent,
  createSubscriptionCardSetup = createStripeSubscriptionCardSetup,
} = {}) {
  async function createStripeSetupIntentHandler(request) {
    requireAuthenticatedCaller(request);
    if (request?.data?.subscriptionReference != null) {
      const subscriptionReference = request.data.subscriptionReference;
      const attempt = request.data.idempotencyReference;
      if (typeof subscriptionReference !== "string" || !/^sub_[a-zA-Z0-9_]+$/.test(subscriptionReference)
        || typeof attempt !== "string" || !attempt.trim() || attempt.length > 500) {
        throw new HttpsError("invalid-argument", "Valid subscription and attempt references are required.");
      }
      try {
        const result = await createSubscriptionCardSetup({internalReference: request.auth.uid,
          subscriptionReference, idempotencyReference: attempt,
          ...(request.data.cardChangeScope === undefined ? {} : {cardChangeScope: cardChangeScope(request.data.cardChangeScope)})});
        if (!result?.clientSecret || !result?.setupIntentReference) throw Error("Invalid SetupIntent result.");
        return {setupIntentReference: result.setupIntentReference, clientSecret: result.clientSecret,
          ...(result.cardChangeTargets ? {cardChangeTargets: result.cardChangeTargets.map(target => ({
            subscriptionReference: String(target.subscriptionReference), studentId: String(target.studentId),
            studentName: String(target.studentName || target.studentId), planId: target.planId || null}))} : {})};
      } catch (error) {
        if (["not-found", "failed-precondition", "invalid-argument"].includes(error?.code)) {
          throw new HttpsError(error.code, error.message);
        }
        throw error;
      }
    }
    const customerReference = requireCustomerReference(request);

    const clientSecret = String(
      await createPaymentSetupIntent({customerReference}),
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
