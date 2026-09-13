import {
  normalizeStripeClientSecret,
  normalizeStripeSetupContextReference
} from "../domain/stripe_payment_references.js?v=20260907-stripe-setup-context-v1";

function requireContainerSelector(value) {
  const selector = String(value ?? "").trim();

  if (!selector) {
    throw new Error("Stripe Payment Element container selector is required.");
  }

  return selector;
}

export class MountStripeSetupPaymentElement {
  constructor({getStripeClientConfig, stripeSetupGateway}) {
    this.getStripeClientConfig = getStripeClientConfig;
    this.stripeSetupGateway = stripeSetupGateway;
  }

  async execute({clientSecret, containerSelector} = {}) {
    const config = await this.getStripeClientConfig();
    const contextReference =
      await this.stripeSetupGateway.mountPaymentElement({
        publishableKey: config.publishableKey,
        clientSecret: normalizeStripeClientSecret(clientSecret),
        containerSelector: requireContainerSelector(containerSelector),
        mode: config.mode
      });

    return Object.freeze({
      contextReference: normalizeStripeSetupContextReference(
        contextReference
      ),
      mode: config.mode
    });
  }
}