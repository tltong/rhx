// Merge into the existing database match. This is not a replacement ruleset.
function cancelledSubscriptionAccessAllows(billing, cancellation) {
  let paidUntil = billing.get('activeUntil', null);
  let retainedUntil = cancellation.get('accessUntil', null);
  return (paidUntil is timestamp && request.time < paidUntil)
    || (retainedUntil is timestamp && request.time < retainedUntil);
}
function studentBillingDocumentAllows(studentId) {
  let billing = get(/databases/$(database)/documents/subscriptions/$(studentId)).data;
  let recovery = billing.get('renewalRecovery', null);
  let summary = billing.get('billingSummary', null);
  let context = summary is map && summary.get('paymentProvider', null) == 'stripe' ? summary : billing;
  let recovering = recovery is map
    && recovery.get('paymentProvider', null) == context.get('paymentProvider', null)
    && recovery.get('paymentMode', null) == context.get('paymentMode', null)
    && recovery.get('paymentSubscriptionReference', null) == context.get('paymentSubscriptionReference', null)
    && recovery.get('state', 'completed') != 'completed';
  let cancellation = billing.get('subscriptionCancellation', null);
  let cancelled = cancellation is map && cancellation.get('state', '') == 'cancelled'
    && cancellation.get('paymentMode', null) == context.get('paymentMode', null)
    && cancellation.get('paymentSubscriptionReference', null) == context.get('paymentSubscriptionReference', null);
  let paidUntil = billing.get('activeUntil', null);
  let pendingGrace = billing.get('renewalGraceUntil', null) is timestamp
    ? billing.renewalGraceUntil : paidUntil is timestamp ? paidUntil + duration.value(72, 'h') : request.time;
  let ended = summary is map && summary.get('subscriptionStatus', '') in ['canceled', 'incomplete_expired'];
  return billing.get('applicationStatus', 'active') != 'suspended'
    && (cancelled ? cancelledSubscriptionAccessAllows(billing, cancellation) : recovering
      ? recovery.get('graceUntil', null) is timestamp && request.time < recovery.graceUntil
      : billing.get('paymentProvider', null) != 'stripe'
        || (paidUntil is timestamp && (request.time < paidUntil || (!ended && request.time < pendingGrace))));
}
function studentHasBillingAccess(studentId) {
  return !exists(/databases/$(database)/documents/subscriptions/$(studentId))
    || studentBillingDocumentAllows(studentId);
}
function currentStudentHasBillingAccess() {
  return request.auth != null && studentHasBillingAccess(request.auth.uid);
}
function clientPreservesBillingState() {
  return !request.resource.data.diff(resource.data).affectedKeys().hasAny([
    'subscriptionType', 'activeUntil', 'applicationStatus', 'paymentProvider', 'paymentMode',
    'paymentCustomerReference', 'paymentSubscriptionReference', 'planId', 'billingSummary', 'renewalRecovery', 'renewalGraceUntil', 'subscriptionCancellation'
  ]);
}
