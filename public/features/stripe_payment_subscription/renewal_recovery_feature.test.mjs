import {test} from "node:test";
import assert from "node:assert/strict";
import {ManageRenewalRecovery} from "./application/manage_renewal_recovery.js";
import {RetryStripeSubscriptionPayment} from "./application/retry_subscription_payment.js";
const result = {subscriptionReference: "sub_one", subscriptionStatus: "paused", applicationStatus: "active",
  renewalRecovery: {version: 2, state: "pending_payment", firstFailedAt: "2026-11-01T00:00:00Z", graceUntil: "2026-11-04T00:00:00Z"},
  currentCard: null, canChangeCard: false, paymentState: "unpaid", linkedInvoiceIsCurrent: true, recoveryPending: true, canCancelPendingPayment: true,
  renewal: {action: "enter_new_card", subscriptionReference: "sub_one", invoiceReference: "in_original", attemptInvoiceReference: "in_fresh",
    amountDue: 2500, currency: "myr", paymentClientSecret: "pi_one_secret_private", canRetry: false}};
test("new-card preparation and cancellation use authenticated subscription feature commands", async () => {
  const calls = [], feature = new ManageRenewalRecovery({manageRenewalRecovery: async value => {calls.push(value); return structuredClone(result);}});
  const prepared = await feature.execute({subscriptionReference: "sub_one", invoiceReference: "in_original", planId: "monthly", quoteReference: "quote",
    idempotencyReference: "attempt", amount: 1, customerReference: "forged"}, "new_card");
  assert.equal(prepared.renewalRecovery.version, 2); assert.equal(prepared.recoveryPending, true); assert.equal(prepared.renewal.attemptInvoiceReference, "in_fresh");
  assert.deepEqual(calls[0], {subscriptionReference: "sub_one", action: "new_card", invoiceReference: "in_original", idempotencyReference: "attempt", planId: "monthly", quoteReference: "quote"});
  await feature.execute({subscriptionReference: "sub_one"}, "cancel_payment"); assert.deepEqual(calls[1], {subscriptionReference: "sub_one", action: "cancel_payment"});
});
test("existing retry feature carries selected plan and quote but no client pricing", async () => {
  let received;
  const feature = new RetryStripeSubscriptionPayment({retrySubscriptionPayment: async input => {received = input; return {...result.renewal, action: "retry_payment"};}});
  await feature.execute({subscriptionReference: "sub_one", invoiceReference: "in_original", idempotencyReference: "attempt", planId: "annual", quoteReference: "quote", amount: 1});
  assert.deepEqual(received, {subscriptionReference: "sub_one", invoiceReference: "in_original", idempotencyReference: "attempt", planId: "annual", quoteReference: "quote"});
});
test("invalid new-card preparation never reaches the gateway", async () => {
  let calls = 0; const feature = new ManageRenewalRecovery({manageRenewalRecovery: async () => calls++});
  await assert.rejects(() => feature.execute({subscriptionReference: "sub_one"}, "new_card")); assert.equal(calls, 0);
});
