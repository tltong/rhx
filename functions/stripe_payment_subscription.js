const {
  HttpsError,
  onCall,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  paymentProviderSecrets,
} = require("./features/payment_factory/payment_factory_module");
const {
  createStripePaymentSubscription,
  getStripeSubscriptionPaymentAction:
    loadStripeSubscriptionPaymentAction,
} = require(
  "./features/stripe_payment_subscription/stripe_payment_subscription_module"
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
      "Sign in before accessing a Stripe subscription.",
    );
  }

  return callerUid;
}

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is required.`,
    );
  }

  return text;
}

function requireDocumentReference(value, fieldName) {
  const reference = requireText(value, fieldName);

  if (reference.includes("/")) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must not contain a slash.`,
    );
  }

  return reference;
}

function requireIdempotencyReference(value) {
  const reference = requireText(value, "idempotencyReference");

  if (reference.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "idempotencyReference must not exceed 500 characters.",
    );
  }

  return reference;
}

function subscriptionInput(request, internalReference) {
  return Object.freeze({
    internalReference,
    studentId: requireDocumentReference(
      request?.data?.studentId,
      "studentId",
    ),
    customerReference: requireText(
      request?.data?.customerReference,
      "customerReference",
    ),
    paymentMethodReference: requireText(
      request?.data?.paymentMethodReference,
      "paymentMethodReference",
    ),
    country: requireDocumentReference(
      request?.data?.country,
      "country",
    ),
    planId: requireDocumentReference(request?.data?.planId, "planId"),
    idempotencyReference: requireIdempotencyReference(
      request?.data?.idempotencyReference,
    ),
  });
}

function normalizeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("The payment provider did not return subscription details.");
  }

  return Object.freeze({
    subscriptionReference: requireText(
      result.subscriptionReference,
      "subscriptionReference",
    ),
    status: requireText(result.status, "status"),
    paymentClientSecret: String(
      result.paymentClientSecret ?? "",
    ).trim() || null,
  });
}

const PAYMENT_ACTIONS = new Set([
  "complete",
  "confirm_payment",
  "replace_payment_method",
  "unavailable",
  "wait",
]);

function requireProviderText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(
      "The payment provider did not return " + fieldName + ".",
    );
  }

  return text;
}

function requireProviderDocumentReference(value, fieldName) {
  const reference = requireProviderText(value, fieldName);

  if (reference.includes("/")) {
    throw new Error(
      "The payment provider returned an invalid " + fieldName + ".",
    );
  }

  return reference;
}

function normalizePaymentActionResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(
      "The payment provider did not return a subscription payment action.",
    );
  }

  const action = requireProviderText(result.action, "action");

  if (!PAYMENT_ACTIONS.has(action)) {
    throw new Error("The payment provider returned an unsupported action.");
  }

  const paymentClientSecret = action === "confirm_payment"
    ? requireProviderText(
      result.paymentClientSecret,
      "paymentClientSecret",
    )
    : null;
  const amountDue = Number(result.amountDue);
  const currency = requireProviderText(
    result.currency,
    "currency",
  ).toLowerCase();

  if (!Number.isSafeInteger(amountDue) || amountDue < 0) {
    throw new Error("The payment provider returned an invalid amountDue.");
  }

  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("The payment provider returned an invalid currency.");
  }

  return Object.freeze({
    action,
    subscriptionReference: requireProviderDocumentReference(
      result.subscriptionReference,
      "subscriptionReference",
    ),
    invoiceReference: requireProviderDocumentReference(
      result.invoiceReference,
      "invoiceReference",
    ),
    paymentStatus: String(result.paymentStatus ?? "").trim() || null,
    paymentClientSecret,
    amountDue,
    currency,
  });
}

function createStripeSubscriptionHandlers({
  createPaymentSubscription = createStripePaymentSubscription,
  getSubscriptionPaymentAction = loadStripeSubscriptionPaymentAction,
} = {}) {
  async function createStripeSubscriptionHandler(request) {
    const internalReference = requireAuthenticatedCaller(request);
    const input = subscriptionInput(request, internalReference);

    try {
      return normalizeResult(await createPaymentSubscription(input));
    } catch (error) {
      if (
        error?.code === "not-found"
        || error?.code === "permission-denied"
        || error?.code === "failed-precondition"
      ) {
        throw new HttpsError(error.code, error.message);
      }

      throw error;
    }
  }

  async function getStripeSubscriptionPaymentActionHandler(request) {
    const internalReference = requireAuthenticatedCaller(request);
    const subscriptionReference = requireDocumentReference(
      request?.data?.subscriptionReference,
      "subscriptionReference",
    );

    try {
      const result = normalizePaymentActionResult(
        await getSubscriptionPaymentAction({
          internalReference,
          subscriptionReference,
        }),
      );

      if (result.subscriptionReference !== subscriptionReference) {
        throw new Error(
          "The payment provider returned an unexpected subscriptionReference.",
        );
      }

      return result;
    } catch (error) {
      if (
        error?.code === "not-found"
        || error?.code === "failed-precondition"
      ) {
        throw new HttpsError(error.code, error.message);
      }

      throw error;
    }
  }

  return Object.freeze({
    createStripeSubscriptionHandler,
    getStripeSubscriptionPaymentActionHandler,
  });
}

function withErrorLogging(handler, {logMessage, userMessage}) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(logMessage, {
        callerUid: request?.auth?.uid || null,
        errorMessage: error instanceof Error
          ? error.message
          : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        userMessage,
      );
    }
  };
}

const handlers = createStripeSubscriptionHandlers();
const createStripeSubscription = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(handlers.createStripeSubscriptionHandler, {
    logMessage: "Stripe subscription creation failed.",
    userMessage: "Stripe subscription creation failed.",
  }),
);
const getStripeSubscriptionPaymentAction = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging(
    handlers.getStripeSubscriptionPaymentActionHandler,
    {
      logMessage: "Stripe subscription payment action lookup failed.",
      userMessage: "Could not load the Stripe subscription payment action.",
    },
  ),
);

module.exports = {
  createStripeSubscription,
  createStripeSubscriptionHandlers,
  getStripeSubscriptionPaymentAction,
};
