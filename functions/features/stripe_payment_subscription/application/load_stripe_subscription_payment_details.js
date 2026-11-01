// One authenticated ownership lookup is shared across the status-read path.
// Mutation/reconciliation paths must reload it when billing state changes.
async function loadStripeSubscriptionPaymentDetails({input, cancellation, management}) {
  const owned = await cancellation.reconcile(input);
  const details = await management.getDetails(input, owned);
  const changed = details.subscriptionStatus !== owned.subscription.status
    || details.renewalRecovery?.state !== owned.student?.renewalRecovery?.state;
  return cancellation.decorate(input, details, changed ? null : owned);
}
module.exports = {loadStripeSubscriptionPaymentDetails};
