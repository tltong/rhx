import {normalizePaymentDetails} from "./manage_subscription_payment.js?v=20261101-stored-status-v1";
import {normalizeSubscriptionReference, normalizeInvoiceReference} from "./get_subscription_payment_action.js?v=20261101-stored-status-v1";
export class ManageRenewalRecovery {
  constructor(gateway) {this.gateway = gateway;}
  async execute(input, action) {
    const subscriptionReference = normalizeSubscriptionReference(input.subscriptionReference);
    const command = {subscriptionReference, action};
    if (input.invoiceReference) command.invoiceReference = normalizeInvoiceReference(input.invoiceReference);
    if (action === "new_card") {
      if (typeof input.idempotencyReference !== "string" || !input.idempotencyReference.trim() || input.idempotencyReference.length > 500) throw Error("A payment attempt reference is required.");
      command.idempotencyReference = input.idempotencyReference.trim();
      if (input.planId) command.planId = String(input.planId);
      if (input.quoteReference) command.quoteReference = String(input.quoteReference);
    }
    return normalizePaymentDetails(await this.gateway.manageRenewalRecovery(command), subscriptionReference);
  }
}
