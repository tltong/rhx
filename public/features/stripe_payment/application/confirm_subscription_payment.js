import {
  normalizeStripeClientSecret
} from "../domain/stripe_payment_references.js?v=20260912-stripe-subscription-confirm-v1";
import {
  normalizeStripeRedirectBehavior
} from "../domain/stripe_redirect_behavior.js?v=20260919-redirect-toggle-v1";

function requireReturnUrl(value) {
  const returnUrl = String(value ?? "").trim();

  if (!returnUrl) {
    throw new Error("Stripe payment return URL is required.");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(returnUrl);
  } catch {
    throw new Error("Stripe payment return URL must be an absolute URL.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    throw new Error("Stripe payment return URL must use HTTPS.");
  }

  return parsedUrl.href;
}

function normalizePaymentIntent(paymentIntent) {
  if (!paymentIntent || typeof paymentIntent !== "object") {
    throw new Error("Stripe did not return the confirmed PaymentIntent.");
  }

  const paymentStatus = String(paymentIntent.status ?? "").trim();

  if (!paymentStatus) {
    throw new Error("Stripe returned an invalid PaymentIntent result.");
  }

  return Object.freeze({paymentStatus});
}

export class ConfirmStripeSubscriptionPayment {
  constructor({getStripeClientConfig, stripePaymentConfirmationGateway}) {
    this.getStripeClientConfig = getStripeClientConfig;
    this.stripePaymentConfirmationGateway =
      stripePaymentConfirmationGateway;
  }

  async execute({
    paymentClientSecret,
    returnUrl,
    redirectBehavior = "if_required"
  } = {}) {
    const clientSecret = normalizeStripeClientSecret(paymentClientSecret);
    const normalizedReturnUrl = requireReturnUrl(returnUrl);
    const normalizedRedirectBehavior =
      normalizeStripeRedirectBehavior(redirectBehavior);
    const config = await this.getStripeClientConfig();

    return normalizePaymentIntent(
      await this.stripePaymentConfirmationGateway.confirmPayment({
        publishableKey: config.publishableKey,
        clientSecret,
        returnUrl: normalizedReturnUrl,
        redirectBehavior: normalizedRedirectBehavior
      })
    );
  }
}

export {normalizePaymentIntent};
