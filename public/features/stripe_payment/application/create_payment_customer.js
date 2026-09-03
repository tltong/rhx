import {
  normalizeInputReference,
  normalizeStripeCustomerReference
} from "../domain/stripe_payment_references.js?v=20260903-stripe-customer-test-v1";

export class CreatePaymentCustomer {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(inputReference) {
    const customerReference =
      await this.stripePaymentGateway.createCustomer(
        normalizeInputReference(inputReference)
      );

    return normalizeStripeCustomerReference(customerReference);
  }
}
