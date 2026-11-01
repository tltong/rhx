import {normalizeCardChangeScope} from "../../stripe_payment_subscription/application/manage_subscription_payment.js?v=20261031-subscription-cancel-v1";
import {
  normalizeStripeClientSecret,
  normalizeStripeCustomerReference
} from "../domain/stripe_payment_references.js?v=20260904-stripe-setup-intent-v1";

export class CreateStripeSetupIntent {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(customerReference) {
    if (customerReference && typeof customerReference === "object") {
      const {subscriptionReference, idempotencyReference} = customerReference;
      if (!/^sub_[a-zA-Z0-9_]+$/.test(subscriptionReference || "")
        || typeof idempotencyReference !== "string" || !idempotencyReference.trim()
        || idempotencyReference.length > 500) throw Error("Valid subscription and attempt references are required.");
      const result = await this.stripePaymentGateway.createSetupIntent({subscriptionReference, idempotencyReference,
        ...(customerReference.cardChangeScope === undefined ? {} : {cardChangeScope: normalizeCardChangeScope(customerReference.cardChangeScope)})});
      if (!/^seti_[a-zA-Z0-9_]+$/.test(result?.setupIntentReference || "")) throw Error("Invalid card setup response.");
      return {setupIntentReference: result.setupIntentReference,
        clientSecret: normalizeStripeClientSecret(result.clientSecret)};
    }
    const clientSecret =
      await this.stripePaymentGateway.createSetupIntent(
        normalizeStripeCustomerReference(customerReference)
      );

    return normalizeStripeClientSecret(clientSecret);
  }
}
