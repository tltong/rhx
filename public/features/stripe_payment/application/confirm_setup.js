import {
  normalizeStripeSetupContextReference
} from "../domain/stripe_payment_references.js?v=20260907-stripe-setup-context-v1";

function requireReturnUrl(value) {
  const returnUrl = String(value ?? "").trim();

  if (!returnUrl) {
    throw new Error("Stripe setup return URL is required.");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(returnUrl);
  } catch {
    throw new Error("Stripe setup return URL must be an absolute URL.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    throw new Error("Stripe setup return URL must use HTTPS.");
  }

  return parsedUrl.href;
}

function normalizePaymentMethodReference(value) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  return String(value?.id ?? "").trim() || null;
}

function normalizeSetupIntent(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Stripe did not return the confirmed SetupIntent.");
  }

  const setupIntentReference = String(value.id ?? "").trim();
  const status = String(value.status ?? "").trim();

  if (!setupIntentReference || !status) {
    throw new Error("Stripe returned an invalid SetupIntent result.");
  }

  return Object.freeze({
    setupIntentReference,
    status,
    paymentMethodReference: normalizePaymentMethodReference(
      value.payment_method
    )
  });
}

export class ConfirmStripeSetup {
  constructor(stripeSetupGateway) {
    this.stripeSetupGateway = stripeSetupGateway;
  }

  async execute({contextReference, returnUrl} = {}) {
    return normalizeSetupIntent(
      await this.stripeSetupGateway.confirmSetup({
        contextReference: normalizeStripeSetupContextReference(
          contextReference
        ),
        returnUrl: requireReturnUrl(returnUrl)
      })
    );
  }
}

export { normalizeSetupIntent };