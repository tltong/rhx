const {loadOwnedSubscriptionInvoice, recoveryResult, paymentError} =
  require("./load_owned_subscription_invoice");

class GetStripeSubscriptionPaymentAction {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  async execute(input) {
    if (input?.paymentMethodChoice != null && input.paymentMethodChoice !== "new_card") {
      throw paymentError("invalid-argument", "Unsupported payment method choice.");
    }
    if (input?.paymentMethodChoice && !input.invoiceReference) {
      throw paymentError("invalid-argument", "Select the invoice before entering a new card.");
    }
    let loaded = await loadOwnedSubscriptionInvoice(this.dependencies, input);
    if (this.dependencies.ensureRenewalRecovery) {
      const upgraded = await this.dependencies.ensureRenewalRecovery(loaded);
      if (upgraded) loaded = await loadOwnedSubscriptionInvoice(this.dependencies, input);
    }
    const result = recoveryResult(loaded);
    if (input?.paymentMethodChoice === "new_card" && result.canPayWithNewCard) {
      if (!loaded.context.paymentClientSecret) throw new Error("Stripe did not return a payment client secret.");
      return Object.freeze({...result, action: "enter_new_card", canRetry: false,
        paymentClientSecret: loaded.context.paymentClientSecret});
    }
    return result;
  }
}

module.exports = {GetStripeSubscriptionPaymentAction};
