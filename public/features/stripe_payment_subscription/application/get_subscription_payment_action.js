// Subscription state and actions are queried through the subscription feature.
const PAYMENT_ACTIONS = new Set([
  "complete",
  "confirm_payment",
  "replace_payment_method",
  "unavailable",
  "wait",
  "retry_payment",
  "enter_new_card"
]);

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(fieldName + " is required.");
  }

  return text;
}

function requireDocumentReference(value, fieldName) {
  const reference = requireText(value, fieldName);

  if (reference.includes("/")) {
    throw new Error(fieldName + " must not contain a slash.");
  }

  return reference;
}

function normalizeSubscriptionReference(value) {
  const reference = requireDocumentReference(
    value,
    "Stripe subscription reference"
  );

  if (!reference.startsWith("sub_")) {
    throw new Error(
      "Stripe subscription reference must start with sub_."
    );
  }

  return reference;
}

function normalizePaymentActionResult(value, expectedReference, expectedInvoice) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "Stripe subscription payment action response is invalid."
    );
  }

  const action = requireText(value.action, "Payment action");

  if (!PAYMENT_ACTIONS.has(action)) {
    throw new Error("Stripe returned an unsupported payment action.");
  }

  const subscriptionReference = normalizeSubscriptionReference(
    value.subscriptionReference
  );

  if (subscriptionReference !== expectedReference) {
    throw new Error(
      "Stripe returned an unexpected subscription reference."
    );
  }

  const invoiceReference = requireDocumentReference(
    value.invoiceReference,
    "Stripe invoice reference"
  );
  const paymentStatus =
    String(value.paymentStatus ?? "").trim() || null;
  if (expectedInvoice && invoiceReference !== expectedInvoice) {
    throw new Error("Stripe returned an unexpected invoice reference.");
  }
  const amountDue = Number(value.amountDue);
  const currency = requireText(
    value.currency,
    "Stripe invoice currency"
  ).toLowerCase();

  if (!Number.isSafeInteger(amountDue) || amountDue < 0) {
    throw new Error("Stripe returned an invalid invoice amount.");
  }

  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("Stripe returned an invalid invoice currency.");
  }

  const paymentClientSecret = ["confirm_payment", "enter_new_card"].includes(action) && value.requiresActionFetch !== true
    ? requireText(
      value.paymentClientSecret,
      "Stripe payment client secret"
    )
    : null;

  return Object.freeze({
    action,
    subscriptionReference,
    invoiceReference,
    paymentStatus,
    paymentClientSecret,
    ...(value.requiresActionFetch === true ? {requiresActionFetch: true} : {}),
    amountDue,
    currency,
    ...(typeof value.canRetry === "boolean" ? {
      canRetry: value.canRetry && action === "retry_payment",
      savedCard: normalizeSavedCard(value.savedCard),
      failureCode: String(value.failureCode || "") || null,
      invoiceStatus: String(value.invoiceStatus || "") || null,
      subscriptionStatus: String(value.subscriptionStatus || "") || null,
      billingReason: String(value.billingReason || "") || null,
      canPayWithNewCard: value.canPayWithNewCard === true,
      paymentState: String(value.paymentState || "") || null,
      nextPaymentAttemptAt: String(value.nextPaymentAttemptAt || "") || null,
      studentId: String(value.studentId || "") || null,
      planId: String(value.planId || "") || null,
      ...(value.attemptInvoiceReference ? {attemptInvoiceReference: normalizeInvoiceReference(value.attemptInvoiceReference)} : {}),
      ...(Number.isSafeInteger(value.amountPaid) && value.amountPaid >= 0 ? {amountPaid: value.amountPaid} : {})
    } : {})
  });
}

function normalizeSavedCard(card) {
  if (!card) return null;
  if (!/^\d{4}$/.test(card.last4) || !Number.isInteger(card.expiryMonth)
    || card.expiryMonth < 1 || card.expiryMonth > 12
    || !Number.isInteger(card.expiryYear)) {
    throw new Error("Stripe returned invalid saved card details.");
  }
  return Object.freeze({brand: String(card.brand), last4: card.last4,
    expiryMonth: card.expiryMonth, expiryYear: card.expiryYear});
}

function normalizeInvoiceReference(value) {
  const reference = requireDocumentReference(value, "Stripe invoice reference");
  if (!/^in_[a-zA-Z0-9_]+$/.test(reference)) {
    throw new Error("Stripe invoice reference is invalid.");
  }
  return reference;
}

export class GetStripeSubscriptionPaymentAction {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(subscriptionReference) {
    const input = typeof subscriptionReference === "string"
      ? null : subscriptionReference;
    const reference = normalizeSubscriptionReference(
      input ? input.subscriptionReference : subscriptionReference
    );
    const invoiceReference = input?.invoiceReference == null ? null
      : normalizeInvoiceReference(input.invoiceReference);
    const paymentMethodChoice = input?.paymentMethodChoice;
    if (paymentMethodChoice != null && paymentMethodChoice !== "new_card") {
      throw new Error("Unsupported payment method choice.");
    }
    if (paymentMethodChoice && !invoiceReference) throw new Error("Select an invoice before entering a new card.");

    return normalizePaymentActionResult(
      await this.stripePaymentGateway.getSubscriptionPaymentAction(
        invoiceReference ? {subscriptionReference: reference, invoiceReference,
          ...(paymentMethodChoice ? {paymentMethodChoice} : {})} : reference
      ),
      reference,
      invoiceReference
    );
  }
}

export {
  normalizePaymentActionResult,
  normalizeInvoiceReference,
  normalizeSubscriptionReference,
  normalizeSavedCard
};
