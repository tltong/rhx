const {createHash} = require("node:crypto");
const {loadOwnedSubscriptionInvoice, recoveryResult, requireStripeReference,
  paymentError} = require("./load_owned_subscription_invoice");

class RetryStripeSubscriptionInvoicePayment {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  async execute(input = {}) {
    requireStripeReference(input.invoiceReference, "in_", "invoiceReference");
    const attempt = input.idempotencyReference;
    if (typeof attempt !== "string" || !attempt.trim() || attempt.length > 500) {
      throw paymentError("invalid-argument", "idempotencyReference is invalid.");
    }
    let loaded = await loadOwnedSubscriptionInvoice(this.dependencies, input);
    if (loaded.context.billingReason !== "subscription_cycle") {
      throw paymentError("failed-precondition",
        "Only recurring subscription renewal invoices can be retried here.");
    }
    if (this.dependencies.ensureRenewalRecovery) {
      const upgraded = await this.dependencies.ensureRenewalRecovery(loaded);
      if (upgraded) loaded = await loadOwnedSubscriptionInvoice(this.dependencies, input);
    }
    const before = recoveryResult(loaded);
    // Never resubmit an invoice already paid, processing, or requiring 3DS.
    if (!before.canRetry) {
      if (before.action === "complete" && this.dependencies.observeRecoveredPayment) await this.dependencies.observeRecoveredPayment(loaded);
      return before;
    }
    const idempotencyReference = createHash("sha256")
      .update(JSON.stringify([loaded.mode, loaded.internalReference,
        before.subscriptionReference, before.invoiceReference, attempt.trim()]))
      .digest("hex");
    let paymentFailure = null;
    try {
      await loaded.paymentProvider.payInvoice({
        invoiceReference: before.invoiceReference,
        paymentMethodReference: loaded.paymentMethodReference,
        idempotencyReference,
      });
    } catch (error) {
      // Stripe errors can also mean requires_action, a concurrent payment,
      // or a lost response. Read authoritative state before deciding.
      paymentFailure = error;
    }
    let current;
    try {
      current = await loadOwnedSubscriptionInvoice(this.dependencies, input);
    } catch {
      throw paymentError("unavailable",
        "The payment result is not confirmed. Check the invoice status before retrying.");
    }
    if (current.context.invoiceStatus === "paid" && this.dependencies.observeRecoveredPayment) {
      await this.dependencies.observeRecoveredPayment(current);
    }
    const result = recoveryResult(current);
    if (!paymentFailure || ["complete", "confirm_payment", "wait"].includes(result.action)) {
      return result;
    }
    if (paymentFailure.type === "StripeCardError"
      || paymentFailure.rawType === "card_error") {
      return recoveryResult(current,
        paymentFailure.decline_code || paymentFailure.code || current.context.failureCode);
    }
    throw paymentError("unavailable",
      "The payment result is not confirmed. Check the invoice status before retrying.");
  }
}

module.exports = {RetryStripeSubscriptionInvoicePayment};
