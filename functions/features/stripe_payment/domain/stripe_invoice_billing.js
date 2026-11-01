function stripeDate(value, name, optional = false) {
  if (value == null && optional) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid Stripe ${name}.`);
  return new Date(value * 1000);
}
function minorAmount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid Stripe ${name}.`);
  return value;
}
function ref(value) {return typeof value === "object" ? value?.id : value;}
async function billingDetails(client, invoice, subscriptionReference) {
  let lines = invoice.lines?.data || [];
  if (invoice.lines?.has_more) {
    // Fetch every page: choosing the first subscription line can grant an
    // incorrect period when later lines contain another period or prorations.
    lines = []; let after = null;
    for (let page = 0; ; page++) {
      if (page > 100) throw Error("Too many Stripe invoice line pages.");
      const result = await client.invoices.listLineItems(invoice.id,
        {limit: 100, ...(after ? {starting_after: after} : {})});
      if (!Array.isArray(result.data)) throw Error("Invalid Stripe invoice lines.");
      lines.push(...result.data);
      if (!result.has_more) break;
      const next = result.data.at(-1)?.id;
      if (!next || next === after) throw Error("Invalid Stripe invoice line pagination.");
      after = next;
    }
  }
  const qualifiedLines = lines.filter(line => {
    const detail = line.parent?.subscription_item_details;
    const isSubscription = line.parent?.type === "subscription_item_details" || line.type === "subscription";
    const subscription = ref(detail?.subscription || line.subscription);
    return isSubscription && !(detail?.proration || line.proration)
      && (!subscription || subscription === subscriptionReference);
  });
  const periods = qualifiedLines.map(line => ({start: stripeDate(line.period?.start, "invoice line period start"),
    end: stripeDate(line.period?.end, "invoice line period end")}));
  const period = periods[0];
  const unambiguous = period && period.end > period.start && periods.every(p =>
    p.start.getTime() === period.start.getTime() && p.end.getTime() === period.end.getTime());
  const currency = String(invoice.currency).toUpperCase();
  return {
    ...(qualifiedLines.some(line => line.pricing?.price_details?.price || line.price || line.plan)
      ? {billingPriceReferences: [...new Set(qualifiedLines.map(line => ref(line.pricing?.price_details?.price || line.price || line.plan)).filter(Boolean))]} : {}),
    amountPaid: minorAmount(invoice.amount_paid, "invoice amount paid"),
    attemptCount: minorAmount(invoice.attempt_count, "invoice attempt count"),
    invoiceCreatedAt: stripeDate(invoice.created, "invoice creation timestamp"),
    invoiceFinalizedAt: stripeDate(invoice.status_transitions?.finalized_at, "invoice finalization timestamp", true),
    paidAt: stripeDate(invoice.status_transitions?.paid_at, "invoice paid timestamp", true),
    billingPeriodStart: unambiguous ? period.start : null,
    billingPeriodEnd: unambiguous ? period.end : null,
    currencyExponent: ["ISK", "UGX"].includes(currency) ? 2
      : new Intl.NumberFormat("en", {style: "currency", currency}).resolvedOptions().maximumFractionDigits,
  };
}
module.exports = {billingDetails};
