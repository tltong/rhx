const {
  HttpsError,
  onCall,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  paymentProviderSecrets,
} = require("./features/payment_factory/payment_factory_module");
const {
  createStripePaymentCustomer,
  deleteStripePaymentCustomer,
} = require(
  "./features/stripe_payment_customer/stripe_payment_customer_module"
);

const CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
  secrets: paymentProviderSecrets,
});

function requireAuthenticatedCaller(request) {
  const callerUid = String(request?.auth?.uid ?? "").trim();

  if (!callerUid) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before creating a payment customer.",
    );
  }

  return callerUid;
}

function requireInputReference(request) {
  const inputReference = String(
    request?.data?.inputReference ?? "",
  ).trim();

  if (!inputReference) {
    throw new HttpsError(
      "invalid-argument",
      "inputReference is required.",
    );
  }

  if (inputReference.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "inputReference must not exceed 500 characters.",
    );
  }

  return inputReference;
}

function requireEmail(request) {
  const email = String(request?.data?.email ?? "").trim();

  if (!email) {
    throw new HttpsError(
      "invalid-argument",
      "email is required.",
    );
  }

  if (email.length > 320) {
    throw new HttpsError(
      "invalid-argument",
      "email must not exceed 320 characters.",
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError(
      "invalid-argument",
      "email must be a valid email address.",
    );
  }

  return email;
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

function createPaymentCustomerHandlers({
  createStripeCustomer = createStripePaymentCustomer,
  deleteStripeCustomer = deleteStripePaymentCustomer,
} = {}) {
  async function createPaymentCustomerHandler(request) {
    const callerUid = requireAuthenticatedCaller(request);
    const inputReference = requireInputReference(request);
    const email = requireEmail(request);

    if (inputReference !== callerUid) {
      throw new HttpsError(
        "permission-denied",
        "inputReference must match the authenticated user.",
      );
    }

    const customerReference = String(
      await createStripeCustomer({
        internalReference: callerUid,
        email,
      }),
    ).trim();

    if (!customerReference) {
      throw new Error(
        "The payment provider did not return a customer reference.",
      );
    }

    return customerReference;
  }

  async function deleteCustomerHandler(request) {
    requireAuthenticatedCaller(request);
    const customerReference = requireCustomerReference(request);
    const deletedReference = String(
      await deleteStripeCustomer({customerReference}),
    ).trim();

    return deletedReference;
  }

  return Object.freeze({
    createPaymentCustomerHandler,
    deleteCustomerHandler,
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

      logger.error("Payment customer creation failed.", {
        callerUid: request?.auth?.uid || null,
        errorMessage: error instanceof Error
          ? error.message
          : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        "Payment customer creation failed.",
      );
    }
  };
}

const handlers = createPaymentCustomerHandlers();
const createPaymentCustomer = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(handlers.createPaymentCustomerHandler),
);
const deleteCustomer = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(handlers.deleteCustomerHandler),
);

module.exports = {
  createPaymentCustomer,
  createPaymentCustomerHandlers,
  deleteCustomer,
};
