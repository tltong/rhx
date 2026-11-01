import assert from "node:assert/strict";
import {test} from "node:test";
import {ManageStripeSubscriptionPayment}
  from "../stripe_payment_subscription/application/manage_subscription_payment.js";
import {CreateStripeSetupIntent} from "./application/create_setup_intent.js";
import {GetStripeSubscriptionPaymentAction}
  from "../stripe_payment_subscription/application/get_subscription_payment_action.js";
import {BrowserStripeSetupGateway} from "./infrastructure/browser_stripe_setup_gateway.js";
import {ConfirmStripeSubscriptionPayment} from "./application/confirm_subscription_payment.js";
import {FirebaseCallableStripePaymentGateway} from "./infrastructure/firebase_callable_stripe_payment_gateway.js";
const card = {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030};
const details = {subscriptionReference: "sub_owner", subscriptionStatus: "active", currentCard: card,
  canChangeCard: true, paymentState: "paid", linkedInvoiceIsCurrent: true, renewal: null};

test("management Web APIs forward only authenticated subscription identifiers and mask card output", async () => {
  const calls = [];
  const manager = new ManageStripeSubscriptionPayment({
    async getSubscriptionPaymentDetails(input) {calls.push(input); return {...details, currentCard: {...card, number: "private"}};},
    async updateSubscriptionPaymentMethod(input) {calls.push(input); return details;}
  });
  const result = await manager.getDetails({subscriptionReference: "sub_owner", customerReference: "forged"});
  assert.deepEqual(result.currentCard, card);
  await manager.updateCard({subscriptionReference: "sub_owner", setupIntentReference: "seti_done", paymentMethodReference: "forged"});
  assert.deepEqual(calls, [{subscriptionReference: "sub_owner"}, {subscriptionReference: "sub_owner", setupIntentReference: "seti_done"}]);
  await assert.rejects(() => manager.updateCard({subscriptionReference: "sub_owner", setupIntentReference: "bad"}));
});

test("subscription-scoped SetupIntent creation coexists with existing customer-string contract", async () => {
  const calls = [];
  const api = new CreateStripeSetupIntent({async createSetupIntent(input) {
    calls.push(input); return typeof input === "string" ? "seti_old_secret_old"
      : {setupIntentReference: "seti_new", clientSecret: "seti_new_secret_new"};
  }});
  assert.equal(await api.execute("cus_old"), "seti_old_secret_old");
  assert.deepEqual(await api.execute({subscriptionReference: "sub_owner", idempotencyReference: "attempt", customerReference: "forged"}),
    {setupIntentReference: "seti_new", clientSecret: "seti_new_secret_new"});
  assert.deepEqual(calls[1], {subscriptionReference: "sub_owner", idempotencyReference: "attempt"});
});

test("new-card choice is explicit and only an eligible enter-new-card result exposes its secret", async () => {
  let received;
  const api = new GetStripeSubscriptionPaymentAction({async getSubscriptionPaymentAction(input) {
    received = input; return {action: "enter_new_card", subscriptionReference: "sub_owner", invoiceReference: "in_due",
      amountDue: 2500, currency: "myr", paymentClientSecret: "pi_due_secret_private", canRetry: false, canPayWithNewCard: true};
  }});
  const result = await api.execute({subscriptionReference: "sub_owner", invoiceReference: "in_due", paymentMethodChoice: "new_card"});
  assert.equal(received.paymentMethodChoice, "new_card");
  assert.equal(result.paymentClientSecret, "pi_due_secret_private");
});

test("existing mount context submits new card through confirmPayment and disposes its secret after success", async () => {
  const calls = [];
  const elements = {create: () => ({mount() {}, unmount() {calls.push("unmount");}}),
    async submit() {calls.push("submit"); return {};}};
  const gateway = new BrowserStripeSetupGateway({contextReferenceFactory: () => "stripe_setup_context_newcard",
    stripeFactory: () => ({elements: () => elements,
      async confirmPayment(input) {calls.push(input); return {paymentIntent: {status: "succeeded"}};}})});
  const contextReference = await gateway.mountPaymentElement({publishableKey: "pk_test", clientSecret: "pi_due_secret_private", containerSelector: "#card", mode: "test"});
  const api = new ConfirmStripeSubscriptionPayment({stripeSetupGateway: gateway,
    getStripeClientConfig: async () => {throw Error("Mounted context already owns its Stripe configuration");}});
  assert.deepEqual(await api.execute({contextReference, returnUrl: "https://readyherox.web.app/manage"}), {paymentStatus: "succeeded"});
  assert.equal(calls[0], "submit");
  assert.equal(calls[1].elements, elements);
  assert.equal(calls[1].clientSecret, "pi_due_secret_private");
  assert.equal(calls[2], "unmount");
  assert.throws(() => gateway.requireContext(contextReference), /expired/);
});

test("invalid card details do not submit a charge or dispose the editable context", async () => {
  let confirms = 0;
  const gateway = new BrowserStripeSetupGateway({contextReferenceFactory: () => "stripe_setup_context_invalid",
    stripeFactory: () => ({elements: () => ({create: () => ({mount() {}}),
      submit: async () => ({error: {code: "incomplete_cvc", message: "Complete CVC"}})}),
      confirmPayment: async () => {confirms++;}})});
  const ref = await gateway.mountPaymentElement({publishableKey: "pk_test", clientSecret: "pi_due_secret_private", containerSelector: "#card", mode: "test"});
  await assert.rejects(() => gateway.confirmPayment({contextReference: ref}), e => e.code === "incomplete_cvc");
  assert.equal(confirms, 0);
  assert.ok(gateway.requireContext(ref));
  gateway.disposePaymentElement({contextReference: ref});
  assert.throws(() => gateway.requireContext(ref));
});

test("management Firebase gateways use the correct backend callables", async () => {
  const calls = [];
  const gateway = new FirebaseCallableStripePaymentGateway({getApp: () => ({functions: () => ({httpsCallable: name => async data => {
    calls.push({name, data}); return {data: details};}})})});
  await gateway.getSubscriptionPaymentDetails({subscriptionReference: "sub_owner"});
  await gateway.updateSubscriptionPaymentMethod({subscriptionReference: "sub_owner", setupIntentReference: "seti_done"});
  await gateway.createSetupIntent({subscriptionReference: "sub_owner", idempotencyReference: "attempt"});
  assert.deepEqual(calls.map(c => c.name), ["getStripeSubscriptionPaymentDetails", "updateStripeSubscriptionPaymentMethod", "createStripeSetupIntent"]);
});

test("management subscription state and retry details are normalized without leaking worker fields", async () => {
  const api = new ManageStripeSubscriptionPayment({getSubscriptionPaymentDetails: async () => ({...details,
    applicationStatus: "suspended", renewalRetry: {state: "exhausted", maxRetries: 3, intervalHours: 24,
      attemptsMade: 3, firstFailedAt: "2026-11-01T00:00:00Z", graceUntil: "2026-11-04T00:00:00Z",
      leaseToken: "private-worker", attemptReference: "private-reference", attemptPaymentMethodReference: "pm_private"}})});
  const result = await api.getDetails({subscriptionReference: "sub_owner"});
  assert.equal(result.applicationStatus, "suspended");
  assert.equal(result.renewalRetry.attemptsMade, 3);
  assert.equal(JSON.stringify(result).includes("private"), false);
  const invalid = new ManageStripeSubscriptionPayment({getSubscriptionPaymentDetails: async () => ({...details, applicationStatus: "bogus"})});
  await assert.rejects(() => invalid.getDetails({subscriptionReference: "sub_owner"}), /application subscription status/);
});


test("family card APIs validate scope, strip client target lists and normalize student and per-subscription results", async () => {
  const calls = [];
  const manager = new ManageStripeSubscriptionPayment({async updateSubscriptionPaymentMethod(input) {
    calls.push(input); return {...details, studentName: "Alice", canChangeAllStudents: true,
      cardChangeTargets: [{subscriptionReference: "sub_owner", studentId: "student-a", studentName: "Alice", private: "hidden"}],
      cardUpdateResult: {scope: "all_students", updated: ["sub_owner"], failed: ["sub_second"], skipped: [], private: "hidden"}};
  }});
  const result = await manager.updateCard({subscriptionReference: "sub_owner", setupIntentReference: "seti_done",
    cardChangeScope: "all_students", subscriptionReferences: ["sub_forged"]});
  assert.deepEqual(calls[0], {subscriptionReference: "sub_owner", setupIntentReference: "seti_done", cardChangeScope: "all_students"});
  assert.equal(result.studentName, "Alice");
  assert.equal(result.cardChangeTargets[0].private, undefined);
  assert.deepEqual(result.cardUpdateResult.failed, ["sub_second"]);
  assert.equal(result.cardUpdateResult.private, undefined);
  await assert.rejects(() => manager.updateCard({subscriptionReference: "sub_owner", setupIntentReference: "seti_done", cardChangeScope: "invalid"}));
  assert.equal(calls.length, 1);
});
