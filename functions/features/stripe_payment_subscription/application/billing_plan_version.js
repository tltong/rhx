const date = value => value?.toDate?.() || value;
function forPrice(record, priceReference, at) {
  const version = record.planVersions?.slice().reverse().filter(version => version.priceReference === priceReference && date(version.effectiveAt) <= at)
    .sort((a, b) => +date(b.effectiveAt) - +date(a.effectiveAt))[0];
  return version ? {...record, ...version} : null;
}
function subscriptionBillingRecord(record, subscription) {
  return forPrice(record, subscription.currentPriceReference, subscription.currentPeriodStart) || record;
}
function invoiceBillingRecord(record, context) {
  if (!record.planVersions?.length || !["subscription_create", "subscription_cycle"].includes(context.billingReason)) return record;
  const prices = context.billingPriceReferences || [];
  const resolved = prices.length === 1 && context.billingPeriodStart && forPrice(record, prices[0], context.billingPeriodStart);
  if (!resolved) throw Object.assign(Error("Invoice pricing does not match a registered plan version."), {code: "failed-precondition"});
  return resolved;
}
function supportsInvoicePlan(record, invoice) {
  return record.planId === invoice.planId || record.planVersions?.some(version => version.planId === invoice.planId);
}
module.exports = {subscriptionBillingRecord, invoiceBillingRecord, supportsInvoicePlan};
