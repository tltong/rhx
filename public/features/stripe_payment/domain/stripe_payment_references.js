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

export function normalizeCustomerEmail(value) {
  const email = String(value ?? "").trim();

  if (!email) {
    throw new Error("Customer email is required.");
  }

  if (email.length > 320) {
    throw new Error("Customer email must not exceed 320 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Customer email must be a valid email address.");
  }

  return email;
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

export function normalizeStripeSetupContextReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("Stripe setup context reference is required.");
  }

  if (reference.length > 200) {
    throw new Error(
      "Stripe setup context reference must not exceed 200 characters."
    );
  }

  return reference;
}
