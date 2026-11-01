const {retrieveStripeInvoicePaymentContext} = require("./stripe_invoice");
const ref = value => typeof value === "object" ? value?.id : value;
async function cancelStripeSubscriptionNow(client, input) {
  const id = input.subscriptionReference;
  const load = async () => {
    const s = await client.subscriptions.retrieve(id);
    if (s.id !== id || ref(s.customer) !== input.customerReference) throw Error("Unexpected subscription owner.");
    return s;
  };
  let subscription = await load();
  if (subscription.status === "canceled") return {cancelled: true};
  const invoiceReference = ref(subscription.latest_invoice);
  if (invoiceReference) {
    let invoice = await retrieveStripeInvoicePaymentContext(client, invoiceReference, {includeRecoveryDetails: true});
    if (invoice.customerReference !== input.customerReference || invoice.subscriptionReference !== id) throw Error("Unexpected invoice owner.");
    if (invoice.invoiceStatus === "open") {
      if (["processing", "succeeded"].includes(invoice.paymentStatus)) return {cancelled: false};
      try {await client.invoices.voidInvoice(invoiceReference);} catch (error) {
        invoice = await retrieveStripeInvoicePaymentContext(client, invoiceReference, {includeRecoveryDetails: true});
        if (!["paid", "void"].includes(invoice.invoiceStatus)) {
          if (["processing", "succeeded"].includes(invoice.paymentStatus)) return {cancelled: false};
          throw error;
        }
      }
      invoice = await retrieveStripeInvoicePaymentContext(client, invoiceReference, {includeRecoveryDetails: true});
      if (!["paid", "void"].includes(invoice.invoiceStatus)) return {cancelled: false};
      if (invoice.invoiceStatus === "paid") return {cancelled: false}; // Account for a payment that won the void race before cancelling.
    }
  }
  // Explicitly disable final invoicing/proration. Canceling a managed schedule
  // also cancels its subscription and discards every future phase.
  try {
    if (subscription.schedule) {
      const schedule = await client.subscriptionSchedules.retrieve(ref(subscription.schedule));
      if (ref(schedule.subscription) !== id || ref(schedule.customer) !== input.customerReference) throw Error("Unexpected subscription schedule owner.");
      await client.subscriptionSchedules.cancel(schedule.id, {invoice_now: false, prorate: false});
    } else await client.subscriptions.cancel(id, {invoice_now: false, prorate: false});
  } catch (error) {
    subscription = await load();
    if (subscription.status !== "canceled") throw error;
  }
  return {cancelled: (await load()).status === "canceled"};
}
module.exports = {cancelStripeSubscriptionNow};
