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
      "Sign in before creating a payment customer.",
    );
  }
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
  createProvider = createPaymentProvider,
} = {}) {
  async function createPaymentCustomerHandler(request) {
    requireAuthenticatedCaller(request);
    const inputReference = requireInputReference(request);
    const paymentProvider = await createProvider();

    if (typeof paymentProvider?.createCustomer !== "function") {
      throw new Error(
        "The configured payment provider cannot create customers.",
      );
    }

    const customerReference = String(
      await paymentProvider.createCustomer(inputReference),
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
    const paymentProvider = await createProvider();

    if (typeof paymentProvider?.deleteCustomer !== "function") {
      throw new Error(
        "The configured payment provider cannot delete customers.",
      );
    }

    const deletedReference = String(
      await paymentProvider.deleteCustomer(customerReference),
    ).trim();

    if (!deletedReference) {
      throw new Error(
        "The payment provider did not confirm customer deletion.",
      );
    }

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
