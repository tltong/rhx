import assert from "node:assert/strict";
import {test} from "node:test";
import {ManageRenewalRecovery} from "./application/manage_renewal_recovery.js";
import {normalizeCancellation} from "./application/manage_subscription_payment.js";
import {cancelStripeStudentSubscription} from "./stripe_payment_subscription_module.js";
test("subscription cancellation uses the existing authenticated feature gateway and returns only safe fields", async () => {
  assert.equal(typeof cancelStripeStudentSubscription, "function");
  let seen;
  const api = new ManageRenewalRecovery({manageRenewalRecovery: async input => {seen = input; return {
    subscriptionReference: "sub_one", subscriptionStatus: "canceled", applicationStatus: "active", canCancelSubscription: false,
    cancellation: {state: "cancelled", requestedAt: "2030-11-10T00:00:00Z", cancelledAt: "2030-11-10T00:00:00Z",
      accessUntil: "2030-12-01T00:00:00Z", leaseToken: "private"}};}});
  const result = await api.execute({subscriptionReference: "sub_one", customerReference: "forged", accessUntil: "2099-01-01"}, "cancel_subscription");
  assert.deepEqual(seen, {subscriptionReference: "sub_one", action: "cancel_subscription"});
  assert.equal(result.cancellation.state, "cancelled");
  assert.equal(JSON.stringify(result).includes("private"), false);
});
test("subscription cancellation cannot provide a malformed state or access end", () => {
  assert.throws(() => normalizeCancellation({state: "scheduled"}), /state/);
  assert.throws(() => normalizeCancellation({state: "cancelled", accessUntil: "invalid"}), /date/);
});
