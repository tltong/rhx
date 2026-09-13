const PAYMENT_ACTIONS = new Set([
  "complete",
  "confirm_payment",
  "replace_payment_method",
  "unavailable",
  "wait"
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

function normalizePaymentActionResult(value, expectedReference) {
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

  const paymentClientSecret = action === "confirm_payment"
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
    amountDue,
    currency
  });
}

export class GetStripeSubscriptionPaymentAction {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(subscriptionReference) {
    const reference = normalizeSubscriptionReference(
      subscriptionReference
    );

    return normalizePaymentActionResult(
      await this.stripePaymentGateway.getSubscriptionPaymentAction(
        reference
      ),
      reference
    );
  }
}

export {
  normalizePaymentActionResult,
  normalizeSubscriptionReference
};
