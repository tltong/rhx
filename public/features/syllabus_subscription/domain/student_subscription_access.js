function date(value) {return value instanceof Date ? value : value?.toDate?.() || (typeof value === "string" ? new Date(value) : null);}

export function studentSubscriptionAccess(subscription, now = new Date()) {
  const cancellation = subscription?.subscriptionCancellation;
  const current = subscription?.billingSummary?.paymentProvider === "stripe" ? subscription.billingSummary : subscription;
  if (cancellation?.state === "cancelled" && current?.paymentMode === cancellation.paymentMode
    && current?.paymentSubscriptionReference === cancellation.paymentSubscriptionReference) {
    const ends = [date(cancellation.accessUntil), date(subscription.activeUntil)].filter(value => value instanceof Date && Number.isFinite(+value));
    const expiresAt = ends.length ? new Date(Math.max(...ends.map(Number))) : null;
    const allowed = subscription.applicationStatus !== "suspended" && !!expiresAt && expiresAt > now;
    return {allowed, reason: allowed ? "cancelled_paid_access" : "subscription_cancelled", expiresAt};
  }
  const recovery = subscription?.renewalRecovery;
  const context = subscription?.billingSummary?.paymentProvider === "stripe" ? subscription.billingSummary : subscription;
  const sameContext = recovery && context.paymentProvider === recovery.paymentProvider
    && context.paymentMode === recovery.paymentMode
    && context.paymentSubscriptionReference === recovery.paymentSubscriptionReference;
  if (sameContext && recovery.state !== "completed") {
    const graceUntil = date(recovery.graceUntil);
    const allowed = subscription.applicationStatus !== "suspended" && !!graceUntil && graceUntil > now;
    return {allowed, reason: allowed ? "renewal_grace" : "renewal_suspended", expiresAt: graceUntil || null};
  }
  if (subscription?.applicationStatus === "suspended") return {allowed: false, reason: "suspended", expiresAt: null};
  // Preserve existing manual and trial access behavior. The new billing gate
  // applies to registered Stripe subscriptions rather than unrelated students.
  if (subscription?.paymentProvider !== "stripe") return {allowed: true, reason: "unmanaged", expiresAt: null};
  const paidThrough = date(subscription.activeUntil);
  if (paidThrough && paidThrough > now) return {allowed: true, reason: "paid", expiresAt: paidThrough};
  const ended = ["canceled", "incomplete_expired"].includes(subscription.billingSummary?.subscriptionStatus);
  // Keep access while the next collection is being observed. New paid events
  // persist the configured deadline; old records have the documented 72h default.
  const pendingGrace = date(subscription.renewalGraceUntil) || (paidThrough ? new Date(paidThrough.getTime() + 72 * 3600000) : null);
  const pending = !ended && !!pendingGrace && pendingGrace > now;
  return {allowed: pending, reason: pending ? "renewal_pending" : "payment_required", expiresAt: pendingGrace};
}
