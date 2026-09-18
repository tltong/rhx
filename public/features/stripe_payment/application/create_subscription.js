function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function requireDocumentReference(value, fieldName) {
  const reference = requireText(value, fieldName);

  if (reference.includes("/")) {
    throw new Error(`${fieldName} must not contain a slash.`);
  }

  return reference;
}

function normalizeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Subscription details were not returned.");
  }

  return Object.freeze({
    subscriptionReference: requireText(
      result.subscriptionReference,
      "Stripe subscription reference"
    ),
    status: requireText(result.status, "Stripe subscription status"),
    paymentClientSecret:
      String(result.paymentClientSecret ?? "").trim() || null
  });
}

export class CreateStripeSubscription {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(input = {}) {
    const idempotencyReference = requireText(
      input.idempotencyReference,
      "Idempotency reference"
    );

    if (idempotencyReference.length > 500) {
      throw new Error(
        "Idempotency reference must not exceed 500 characters."
      );
    }

    const result = await this.stripePaymentGateway.createSubscription({
      studentId: requireDocumentReference(input.studentId, "Student ID"),
      customerReference: requireText(
        input.customerReference,
        "Stripe customer reference"
      ),
      paymentMethodReference: requireText(
        input.paymentMethodReference,
        "Stripe PaymentMethod reference"
      ),
      country: requireDocumentReference(input.country, "Country"),
      planId: requireDocumentReference(input.planId, "Plan ID"),
      idempotencyReference
    });

    return normalizeResult(result);
  }
}
