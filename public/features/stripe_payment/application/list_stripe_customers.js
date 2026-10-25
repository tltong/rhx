import {
  normalizeStripeCustomerReference
} from "../domain/stripe_payment_references.js?v=20260906-stripe-customer-email-v1";

export class ListStripeCustomers {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute() {
    const result = await this.stripePaymentGateway.listCustomers();
    if (!["test", "prod"].includes(result?.mode) || !Array.isArray(result.customers)) {
      throw new Error("Stripe customer choices were not returned.");
    }
    return {
      mode: result.mode,
      customers: result.customers.map((customer) => ({
        customerReference: normalizeStripeCustomerReference(
          customer.customerReference
        ),
        email: typeof customer.email === "string" ? customer.email : null
      }))
    };
  }
}
