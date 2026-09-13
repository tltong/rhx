import {
  normalizeSetupIntent
} from "./confirm_setup.js?v=20260906-confirm-setup-secret-v1";
import {
  normalizeStripeClientSecret
} from "../domain/stripe_payment_references.js?v=20260906-stripe-setup-browser-v1";

export class RetrieveStripeSetupIntent {
  constructor({getStripeClientConfig, stripeSetupGateway}) {
    this.getStripeClientConfig = getStripeClientConfig;
    this.stripeSetupGateway = stripeSetupGateway;
  }

  async execute({clientSecret} = {}) {
    const config = await this.getStripeClientConfig();

    return normalizeSetupIntent(
      await this.stripeSetupGateway.retrieveSetupIntent({
        publishableKey: config.publishableKey,
        clientSecret: normalizeStripeClientSecret(clientSecret)
      })
    );
  }
}
