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
  createStripePaymentSubscription,
  getStripeSubscriptionPaymentAction:
    loadStripeSubscriptionPaymentAction,
  retryStripeSubscriptionInvoicePayment,
  getStripeSubscriptionPaymentDetails: loadSubscriptionPaymentDetails,
  updateStripeSubscriptionPaymentMethod: updateSubscriptionPaymentMethod,
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

function requireStripeReference(value, prefix, fieldName) {
  const reference = requireDocumentReference(value, fieldName);
  if (!new RegExp(`^${prefix}[a-zA-Z0-9_]+$`).test(reference)) {
    throw new HttpsError("invalid-argument", `${fieldName} is invalid.`);
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
  "retry_payment",
  "enter_new_card",
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

  const paymentClientSecret = ["confirm_payment", "enter_new_card"].includes(action) && result.requiresActionFetch !== true
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
    ...(result.requiresActionFetch === true ? {requiresActionFetch: true} : {}),
    amountDue,
    currency,
    ...(typeof result.canRetry === "boolean" ? {
      canRetry: result.canRetry && action === "retry_payment",
      savedCard: result.savedCard ? {
        brand: String(result.savedCard.brand),
        last4: String(result.savedCard.last4),
        expiryMonth: result.savedCard.expiryMonth,
        expiryYear: result.savedCard.expiryYear,
      } : null,
      failureCode: result.failureCode || null,
      invoiceStatus: result.invoiceStatus || null,
      subscriptionStatus: result.subscriptionStatus || null,
      billingReason: result.billingReason || null,
      canPayWithNewCard: result.canPayWithNewCard === true,
      paymentState: result.paymentState || null,
      nextPaymentAttemptAt: result.nextPaymentAttemptAt || null,
      studentId: result.studentId || null,
      planId: result.planId || null,
      ...(result.attemptInvoiceReference ? {attemptInvoiceReference: requireProviderDocumentReference(result.attemptInvoiceReference, "attemptInvoiceReference")} : {}),
      ...(Number.isSafeInteger(result.amountPaid) && result.amountPaid >= 0 ? {amountPaid: result.amountPaid} : {}),
    } : {}),
  });
}

function normalizePaymentDetails(result, subscriptionReference) {
  if (!result || result.subscriptionReference !== subscriptionReference) {
    throw Error("Unexpected subscription payment details.");
  }
  if (result.renewal && result.renewal.subscriptionReference !== subscriptionReference) {
    throw Error("Unexpected renewal subscription reference.");
  }
  const card = result.currentCard;
  const applicationStatus = result.applicationStatus || "active";
  if (!["active", "suspended"].includes(applicationStatus)) throw Error("Unexpected application subscription status.");
  const renewalRetry = result.renewalRetry ? Object.fromEntries([
    "state", "maxRetries", "intervalHours", "attemptsMade", "firstFailedAt", "graceUntil",
    "nextAttemptAt", "lastAttemptAt", "lastOutcome", "completedAt", "exhaustedAt"
  ].map(key => [key, result.renewalRetry[key] ?? null])) : null;
  return {subscriptionReference, subscriptionStatus: String(result.subscriptionStatus),
    ...(result.syncState ? {syncState: {state: result.syncState.state === "pending" ? "pending" : "current",
      lastConfirmedAt: result.syncState.lastConfirmedAt || null, unavailable: result.syncState.unavailable === true}} : {}),
    ...(typeof result.canCancelSubscription === "boolean" ? {canCancelSubscription: result.canCancelSubscription} : {}),
    ...(result.cancellation ? {cancellation: Object.fromEntries(["state", "requestedAt", "cancelledAt", "accessUntil"].map(key => [key, result.cancellation[key] || null]))} : {}),
    ...(result.firstChargeAt ? {firstChargeAt: result.firstChargeAt} : {}),
    ...(result.accessUntil ? {accessUntil: result.accessUntil} : {}),
    ...(result.renewalRecovery?.version === 2 ? {canCancelPendingPayment: result.canCancelPendingPayment === true,
      canCancelRenewal: result.canCancelRenewal === true, renewalCancelled: result.renewalCancelled === true,
      recoveryPending: result.recoveryPending === true} : {}),
    applicationStatus, renewalRetry,
    renewalRecovery: result.renewalRecovery ? Object.fromEntries([
      "version", "state", "firstFailedAt", "graceUntil", "paidAt", "paidThrough", "completedAt", "lastErrorCode"
    ].map(key => [key, result.renewalRecovery[key] ?? null])) : null,
    currentCard: card ? {brand: String(card.brand), last4: String(card.last4),
      expiryMonth: card.expiryMonth, expiryYear: card.expiryYear} : null,
    canChangeCard: result.canChangeCard === true,
    nextChargeAt: result.nextChargeAt || null, cancelAtPeriodEnd: result.cancelAtPeriodEnd === true,
    studentId: result.studentId || null, studentName: result.studentName || null, planId: result.planId || null,
    canChangeAllStudents: result.canChangeAllStudents === true,
    cardChangeTargets: (result.cardChangeTargets || []).map(target => ({
      subscriptionReference: requireStripeReference(target.subscriptionReference, "sub_", "subscriptionReference"),
      studentId: String(target.studentId), studentName: String(target.studentName || target.studentId), planId: target.planId || null})),
    cardUpdateResult: result.cardUpdateResult ? {scope: cardChangeScope(result.cardUpdateResult.scope),
      ...Object.fromEntries(["updated", "failed", "skipped"].map(key => [key,
        (result.cardUpdateResult[key] || []).map(ref => requireStripeReference(ref, "sub_", "subscriptionReference"))]))} : null,
    paymentState: result.paymentState || "unavailable",
    linkedInvoiceIsCurrent: result.linkedInvoiceIsCurrent === true,
    renewal: result.renewal ? normalizePaymentActionResult(result.renewal) : null};
}

function createStripeSubscriptionHandlers({
  createPaymentSubscription = createStripePaymentSubscription,
  getSubscriptionPaymentAction = loadStripeSubscriptionPaymentAction,
  retrySubscriptionInvoicePayment = retryStripeSubscriptionInvoicePayment,
  getSubscriptionPaymentDetails = loadSubscriptionPaymentDetails,
  updateSubscriptionCard = updateSubscriptionPaymentMethod,
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
    const subscriptionReference = requireStripeReference(
      request?.data?.subscriptionReference,
      "sub_",
      "subscriptionReference",
    );
    const invoiceReference = request?.data?.invoiceReference == null ? null
      : requireStripeReference(request.data.invoiceReference, "in_", "invoiceReference");
    const paymentMethodChoice = request?.data?.paymentMethodChoice;
    if (paymentMethodChoice != null && paymentMethodChoice !== "new_card") {
      throw new HttpsError("invalid-argument", "Unsupported payment method choice.");
    }
    if (paymentMethodChoice && !invoiceReference) {
      throw new HttpsError("invalid-argument", "invoiceReference is required for new-card payment.");
    }

    try {
      const result = normalizePaymentActionResult(
        await getSubscriptionPaymentAction({
          internalReference,
          subscriptionReference,
          ...(invoiceReference ? {invoiceReference} : {}),
          ...(paymentMethodChoice ? {paymentMethodChoice} : {}),
        }),
      );

      if (result.subscriptionReference !== subscriptionReference) {
        throw new Error(
          "The payment provider returned an unexpected subscriptionReference.",
        );
      }
      if (invoiceReference && result.invoiceReference !== invoiceReference) {
        throw new Error("The payment provider returned an unexpected invoiceReference.");
      }

      return result;
    } catch (error) {
      if (
        error?.code === "not-found"
        || error?.code === "failed-precondition"
        || error?.code === "invalid-argument"
      ) {
        throw new HttpsError(error.code, error.message);
      }

      throw error;
    }
  }

  async function retryStripeSubscriptionPaymentHandler(request) {
    const internalReference = requireAuthenticatedCaller(request);
    const subscriptionReference = requireStripeReference(
      request?.data?.subscriptionReference, "sub_", "subscriptionReference");
    const invoiceReference = requireStripeReference(
      request?.data?.invoiceReference, "in_", "invoiceReference");
    const idempotencyReference = requireIdempotencyReference(
      request?.data?.idempotencyReference);
    try {
      const result = normalizePaymentActionResult(
        await retrySubscriptionInvoicePayment({internalReference,
          subscriptionReference, invoiceReference, idempotencyReference,
          ...(request.data.planId === undefined ? {} : {planId: requireText(request.data.planId, "planId")}),
          ...(request.data.quoteReference === undefined ? {} : {quoteReference: requireText(request.data.quoteReference, "quoteReference")})}),
      );
      if (result.subscriptionReference !== subscriptionReference
        || result.invoiceReference !== invoiceReference) {
        throw new Error("The payment provider returned an unexpected invoice.");
      }
      return result;
    } catch (error) {
      if (["invalid-argument", "not-found", "failed-precondition", "unavailable",
        "permission-denied"].includes(error?.code)) {
        throw new HttpsError(error.code, error.message);
      }
      throw error;
    }
  }

  function managementHandler(operation, update = false) {
    return async request => {
      const internalReference = requireAuthenticatedCaller(request);
      const subscriptionReference = requireStripeReference(
        request?.data?.subscriptionReference, "sub_", "subscriptionReference");
      const input = {internalReference, subscriptionReference};
      if (!update && request?.data?.refreshFromStripe !== undefined) {
        if (typeof request.data.refreshFromStripe !== "boolean") throw new HttpsError("invalid-argument", "refreshFromStripe must be a boolean.");
        input.refreshFromStripe = request.data.refreshFromStripe;
      }
      if (request?.data?.invoiceReference != null) input.invoiceReference =
        requireStripeReference(request.data.invoiceReference, "in_", "invoiceReference");
      if (update && request?.data?.cardChangeScope !== undefined) {
        try {input.cardChangeScope = cardChangeScope(request.data.cardChangeScope);}
        catch (error) {throw new HttpsError("invalid-argument", error.message);}
      }
      if (update) input.setupIntentReference = requireStripeReference(
        request?.data?.setupIntentReference, "seti_", "setupIntentReference");
      try {
        return normalizePaymentDetails(await operation(input), subscriptionReference);
      } catch (error) {
        if (["not-found", "failed-precondition", "invalid-argument", "permission-denied",
          "unavailable"].includes(error?.code)) throw new HttpsError(error.code, error.message);
        throw error;
      }
    };
  }

  return Object.freeze({
    createStripeSubscriptionHandler,
    getStripeSubscriptionPaymentActionHandler,
    retryStripeSubscriptionPaymentHandler,
    getStripeSubscriptionPaymentDetailsHandler: managementHandler(getSubscriptionPaymentDetails),
    updateStripeSubscriptionPaymentMethodHandler: managementHandler(updateSubscriptionCard, true),
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
const retryStripeSubscriptionPayment = onCall(
  {...CALLABLE_OPTIONS, timeoutSeconds: 120},
  withErrorLogging(handlers.retryStripeSubscriptionPaymentHandler, {
    logMessage: "Stripe subscription invoice retry failed.",
    userMessage: "Could not confirm the payment result. Check the invoice status before retrying.",
  }),
);
const getStripeSubscriptionPaymentDetails = onCall({...CALLABLE_OPTIONS, timeoutSeconds: 120},
  withErrorLogging(handlers.getStripeSubscriptionPaymentDetailsHandler, {
    logMessage: "Subscription payment details failed.", userMessage: "Could not load subscription payment details.",
  }));
const updateStripeSubscriptionPaymentMethod = onCall({...CALLABLE_OPTIONS, timeoutSeconds: 120},
  withErrorLogging(handlers.updateStripeSubscriptionPaymentMethodHandler, {
    logMessage: "Subscription card update failed.", userMessage: "Could not confirm the saved card. Refresh to check its status.",
  }));

module.exports = {
  normalizePaymentDetails,
  createStripeSubscription,
  createStripeSubscriptionHandlers,
  getStripeSubscriptionPaymentAction,
  retryStripeSubscriptionPayment,
  getStripeSubscriptionPaymentDetails,
  updateStripeSubscriptionPaymentMethod,
};
