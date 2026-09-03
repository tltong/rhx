import {
  normalizeStripeCustomerReference
} from "../domain/stripe_payment_references.js?v=20260903-stripe-customer-test-v1";

export class DeletePaymentCustomer {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(customerReference) {
    const deletedReference =
      await this.stripePaymentGateway.deleteCustomer(
        normalizeStripeCustomerReference(customerReference)
      );

    return normalizeStripeCustomerReference(deletedReference);
  }
}
