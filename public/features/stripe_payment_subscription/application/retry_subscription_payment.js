import {normalizeSubscriptionReference, normalizeInvoiceReference,
  normalizePaymentActionResult}
  from "./get_subscription_payment_action.js?v=20261101-stored-status-v1";

export class RetryStripeSubscriptionPayment {
  constructor(stripePaymentGateway) {
    this.stripePaymentGateway = stripePaymentGateway;
  }

  async execute(input = {}) {
    const subscriptionReference = normalizeSubscriptionReference(input.subscriptionReference);
    const invoiceReference = normalizeInvoiceReference(input.invoiceReference);
    const idempotencyReference = input.idempotencyReference;
    if (typeof idempotencyReference !== "string" || !idempotencyReference.trim()
      || idempotencyReference.length > 500) {
      throw new Error("A valid idempotencyReference is required.");
    }
    return normalizePaymentActionResult(
      await this.stripePaymentGateway.retrySubscriptionPayment({
        subscriptionReference, invoiceReference,
        idempotencyReference: idempotencyReference.trim(),
        ...(input.planId === undefined ? {} : {planId: String(input.planId)}),
        ...(input.quoteReference === undefined ? {} : {quoteReference: String(input.quoteReference)})
      }), subscriptionReference, invoiceReference
    );
  }
}
