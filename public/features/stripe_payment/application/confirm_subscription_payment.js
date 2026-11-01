import {
  normalizeStripeClientSecret,
  normalizeStripeSetupContextReference
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
  constructor({getStripeClientConfig, stripePaymentConfirmationGateway, stripeSetupGateway = null}) {
    this.stripeSetupGateway = stripeSetupGateway;
    this.getStripeClientConfig = getStripeClientConfig;
    this.stripePaymentConfirmationGateway =
      stripePaymentConfirmationGateway;
  }

  async execute({
    paymentClientSecret,
    contextReference,
    returnUrl,
    redirectBehavior = "if_required",
    authenticationOnly = false,
    useSavedCard = false
  } = {}) {
    const normalizedReturnUrl = requireReturnUrl(returnUrl);
    const normalizedRedirectBehavior =
      normalizeStripeRedirectBehavior(redirectBehavior);
    if (contextReference) {
      if (authenticationOnly || useSavedCard) throw Error("Card entry cannot be combined with authentication-only or saved-card mode.");
      return normalizePaymentIntent(await this.stripeSetupGateway.confirmPayment({
        contextReference: normalizeStripeSetupContextReference(contextReference),
        returnUrl: normalizedReturnUrl, redirectBehavior: normalizedRedirectBehavior}));
    }
    const clientSecret = normalizeStripeClientSecret(paymentClientSecret);
    if (authenticationOnly && useSavedCard) throw Error("Choose either authentication or saved-card confirmation.");
    const config = await this.getStripeClientConfig();

    return normalizePaymentIntent(
      await this.stripePaymentConfirmationGateway.confirmPayment({
        publishableKey: config.publishableKey,
        clientSecret,
        returnUrl: normalizedReturnUrl,
        redirectBehavior: normalizedRedirectBehavior,
        ...(authenticationOnly ? {authenticationOnly: true} : {}),
        ...(useSavedCard ? {useSavedCard: true} : {})
      })
    );
  }
}

export {normalizePaymentIntent};
