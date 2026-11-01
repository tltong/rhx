const {scope, normalizeInvoice, reference, timestamp, billingError} = require("../domain/subscription_invoice");
const {policySnapshot} = require("../domain/renewal_retry");
class ManageSubscriptionBilling {
  constructor({repository, now = () => new Date()}) {this.repository = repository; this.now = now;}
  async initializeInvoiceRecord(input) {
    return this.repository.initializeInvoiceRecord(normalizeInvoice(input, this.now()));
  }
  async getInvoiceRecord(input) {
    return this.repository.getInvoiceRecord({...scope(input), invoiceReference: reference(input.invoiceReference, "invoiceReference")});
  }
  async listInvoiceRecords(input) {
    const limit = input.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw billingError("invalid-argument", "limit must be between 1 and 100.");
    return this.repository.listInvoiceRecords({...scope(input), limit,
      cursor: input.cursor == null ? null : reference(input.cursor, "cursor")});
  }
  async recordInvoicePaymentEvent(input) {
    return this.repository.recordInvoicePaymentEvent({
      invoiceRecord: normalizeInvoice(input, this.now()),
      eventReference: reference(input.eventReference, "eventReference"),
      eventType: reference(input.eventType, "eventType"),
      eventCreatedAt: timestamp(input.eventCreatedAt, "eventCreatedAt"),
      ...(input.renewalRetryPolicy ? {renewalRetryPolicy: policySnapshot(input.renewalRetryPolicy)} : {}),
    });
  }
}
module.exports = {ManageSubscriptionBilling};
