export function normalizeInputReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("Customer reference is required.");
  }

  if (reference.length > 500) {
    throw new Error("Customer reference must not exceed 500 characters.");
  }

  return reference;
}

export function normalizeStripeCustomerReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("Stripe customer reference is required.");
  }

  return reference;
}

export function normalizeStripeClientSecret(value) {
  const clientSecret = String(value ?? "").trim();

  if (!clientSecret) {
    throw new Error("Stripe client secret is required.");
  }

  return clientSecret;
}
