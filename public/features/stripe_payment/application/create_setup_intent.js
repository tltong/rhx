import {
  normalizeStripeClientSecret,
  normalizeStripeCustomerReference
} from "../domain/stripe_payment_references.js?v=20260904-stripe-setup-intent-v1";

export class CreateStripeSetupIntent {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(customerReference) {
    const clientSecret =
      await this.stripePaymentGateway.createSetupIntent(
        normalizeStripeCustomerReference(customerReference)
      );

    return normalizeStripeClientSecret(clientSecret);
  }
}
