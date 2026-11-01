const date = value => value?.toDate?.() || value;
function matches(value, mode, reference) {
  return value?.paymentProvider === "stripe" && value.paymentMode === mode
    && value.paymentSubscriptionReference === reference;
}
function accessEnd(student, mode, reference) {
  const paid = date(student.activeUntil);
  const recovery = student.renewalRecovery;
  const grace = matches(recovery, mode, reference) && recovery.state !== "completed" ? date(recovery.graceUntil) : null;
  const previous = matches(student.subscriptionCancellation, mode, reference)
    && !(matches(recovery, mode, reference) && recovery.state === "completed") ? date(student.subscriptionCancellation.accessUntil) : null;
  const dates = [paid, grace, previous].filter(value => value instanceof Date && Number.isFinite(+value));
  return dates.length ? new Date(Math.max(...dates.map(Number))) : null;
}
function projection(record) {
  return {paymentProvider: "stripe", paymentMode: record.mode, paymentSubscriptionReference: record.subscriptionReference,
    state: record.state, requestedAt: record.requestedAt, cancelledAt: record.cancelledAt || null,
    accessUntil: record.accessUntil || null};
}
module.exports = {matches, accessEnd, projection};
