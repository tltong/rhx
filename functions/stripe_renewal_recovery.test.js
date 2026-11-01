const {test} = require("node:test");
const assert = require("node:assert/strict");
const {createRenewalRecoveryHandler} = require("./stripe_renewal_recovery");
const {fixture} = require("./features/stripe_payment_subscription/test_support/renewal_episode_fixture");
test("renewal callable derives guardian identity and passes only approved command fields", async () => {
  const f = fixture(); await f.initialize(); let received;
  const handler = createRenewalRecoveryHandler({manage: async input => {received = input; return f.controller.command(input);}});
  const result = await handler({auth: {uid: "guardian"}, data: {subscriptionReference: "sub_one", invoiceReference: "in_original",
    action: "new_card", idempotencyReference: "manual", internalReference: "forged", amount: 1, paymentMethodReference: "pm_forged"}});
  assert.deepEqual(received, {internalReference: "guardian", subscriptionReference: "sub_one", invoiceReference: "in_original", action: "new_card", idempotencyReference: "manual"});
  assert.equal(result.renewal.action, "enter_new_card"); assert.equal(result.renewalRecovery.version, 2);
  assert.equal(result.recoveryPending, true); assert.equal(result.leaseToken, undefined);
  assert.equal(result.renewalRecovery.episodeReference, undefined);
});
test("renewal callable rejects missing authentication, invalid commands and missing attempt references", async () => {
  let calls = 0; const handler = createRenewalRecoveryHandler({manage: async () => calls++});
  await assert.rejects(() => handler({data: {}}), e => e.code === "unauthenticated");
  for (const data of [{subscriptionReference: "sub_one", action: "refund"}, {subscriptionReference: "sub_one", action: "new_card"},
    {subscriptionReference: "sub_one/path", action: "cancel_payment"}]) {
    await assert.rejects(() => handler({auth: {uid: "guardian"}, data}), e => e.code === "invalid-argument");
  }
  assert.equal(calls, 0);
});
test("renewal callable preserves safe ownership and service errors", async () => {
  for (const code of ["permission-denied", "not-found", "failed-precondition", "unavailable"]) {
    const handler = createRenewalRecoveryHandler({manage: async () => {throw Object.assign(Error("Safe message"), {code});}});
    await assert.rejects(() => handler({auth: {uid: "guardian"}, data: {subscriptionReference: "sub_one", action: "cancel_payment"}}), e => e.code === code);
  }
});

test("immediate subscription cancellation reuses the authenticated command endpoint and whitelists its result", async () => {
  let received;
  const handler = createRenewalRecoveryHandler({manage: async input => {received = input; return {
    subscriptionReference: "sub_one", subscriptionStatus: "canceled", applicationStatus: "active", linkedInvoiceIsCurrent: true,
    cancellation: {state: "cancelled", requestedAt: "2030-11-10T00:00:00Z", cancelledAt: "2030-11-10T00:00:00Z",
      accessUntil: "2030-12-01T00:00:00Z", leaseToken: "private"}, canCancelSubscription: false};}});
  const result = await handler({auth: {uid: "guardian"}, data: {subscriptionReference: "sub_one", action: "cancel_subscription",
    studentId: "forged", internalReference: "other", amount: 1, accessUntil: "2099-01-01"}});
  assert.deepEqual(received, {internalReference: "guardian", subscriptionReference: "sub_one", action: "cancel_subscription"});
  assert.equal(result.cancellation.accessUntil, "2030-12-01T00:00:00Z");
  assert.equal(result.cancellation.leaseToken, undefined);
});
