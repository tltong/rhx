function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`Stripe client ${fieldName} is required.`);
  }

  return text;
}

function normalizeStripeClientConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stripe client configuration is invalid.");
  }

  const provider = requireText(value.provider, "provider").toLowerCase();
  const mode = requireText(value.mode, "mode").toLowerCase();
  const publishableKey = requireText(
    value.publishableKey,
    "publishable key"
  );

  if (provider !== "stripe") {
    throw new Error("Stripe client provider must be stripe.");
  }

  if (mode !== "test" && mode !== "prod") {
    throw new Error("Stripe client mode must be test or prod.");
  }

  const expectedPrefix = mode === "test" ? "pk_test_" : "pk_live_";

  if (!publishableKey.startsWith(expectedPrefix)) {
    throw new Error(
      `Stripe ${mode} mode requires a ${expectedPrefix} publishable key.`
    );
  }

  return Object.freeze({
    provider,
    mode,
    publishableKey
  });
}

export class GetStripeClientConfig {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute() {
    return normalizeStripeClientConfig(
      await this.stripePaymentGateway.getClientConfig()
    );
  }
}

export { normalizeStripeClientConfig };
