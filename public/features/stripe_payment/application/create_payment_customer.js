import {
  normalizeCustomerEmail,
  normalizeInputReference,
  normalizeStripeCustomerReference
} from "../domain/stripe_payment_references.js?v=20260906-stripe-customer-email-v1";

export class CreatePaymentCustomer {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(inputReference, email) {
    const customerReference =
      await this.stripePaymentGateway.createCustomer(
        normalizeInputReference(inputReference),
        normalizeCustomerEmail(email)
      );

    return normalizeStripeCustomerReference(customerReference);
  }
}
