import assert from "node:assert/strict";
import {test} from "node:test";
import * as subscriptions from "./stripe_payment_subscription_module.js?v=20261101-stored-status-v1";
import * as payments from "../stripe_payment/stripe_payment_module.js";
import {CreateStripeSubscriptionCardSetup} from "./application/create_subscription_card_setup.js";
import {ManageStripeSubscriptionPayment, normalizePaymentDetails} from "./application/manage_subscription_payment.js";

const card = {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030};
const renewal = {action: "retry_payment", subscriptionReference: "sub_owner", invoiceReference: "in_due",
  amountDue: 2500, currency: "myr", canRetry: true, canPayWithNewCard: true,
  paymentState: "failed", savedCard: card, invoiceStatus: "open", failureCode: "insufficient_funds"};
const details = {subscriptionReference: "sub_owner", subscriptionStatus: "past_due", currentCard: card,
  canChangeCard: true, paymentState: "failed", linkedInvoiceIsCurrent: true, renewal};

test("stored status preserves update state and fetches no payment secret", async () => {
  const seen = [];
  const api = new ManageStripeSubscriptionPayment({getSubscriptionPaymentDetails: async input => {seen.push(input); return {...details,
    syncState: {state: "pending", lastConfirmedAt: "2030-11-01T00:00:00Z", unavailable: true},
    renewal: {...renewal, action: "confirm_payment", requiresActionFetch: true, paymentClientSecret: null}};}});
  const result = await api.getDetails({subscriptionReference: "sub_owner", customerReference: "forged"});
  assert.equal(result.renewal.paymentClientSecret, null);
  assert.equal(result.renewal.requiresActionFetch, true);
  assert.equal(result.syncState.unavailable, true);
  await api.getDetails({subscriptionReference: "sub_owner", refreshFromStripe: true});
  assert.deepEqual(seen, [{subscriptionReference: "sub_owner"}, {subscriptionReference: "sub_owner", refreshFromStripe: true}]);
  await assert.rejects(api.getDetails({subscriptionReference: "sub_owner", refreshFromStripe: "true"}));
  assert.throws(() => normalizePaymentDetails({...details, renewal: {...renewal, action: "confirm_payment", paymentClientSecret: null}}, "sub_owner"));
  assert.throws(() => normalizePaymentDetails({...details, syncState: {state: "pending", lastConfirmedAt: "bad-date"}}, "sub_owner"));
});

test("subscription module queries and actions use backend callables without reading Stripe.js", async () => {
  const calls = [];
  const functions = {httpsCallable(name, options) {return async data => {
    calls.push({name, options, data});
    const result = name === "createStripeSetupIntent"
      ? {setupIntentReference: "seti_new", clientSecret: "seti_new_secret_private"}
      : name === "getStripeSubscriptionPaymentAction" || name === "retryStripeSubscriptionPayment"
        ? renewal : details;
    return {data: structuredClone(result)};
  };}};
  const app = {functions(region) {assert.equal(region, "us-central1"); return functions;}, firestore: () => ({})};
  const previousFirebase = globalThis.firebase;
  const previousStripe = Object.getOwnPropertyDescriptor(globalThis, "Stripe");
  globalThis.firebase = {apps: [app], app: () => app, initializeApp: () => app, firestore: () => ({})};
  Object.defineProperty(globalThis, "Stripe", {configurable: true,
    get() {throw Error("Subscription queries must not invoke the browser Stripe SDK");}});
  try {
    const untrusted = {customerReference: "cus_forged", mode: "prod", amount: 1, internalReference: "forged"};
    const references = {subscriptionReference: "sub_owner", invoiceReference: "in_due"};
    const result = await subscriptions.getStripeSubscriptionPaymentDetails({...references, ...untrusted});
    assert.equal(result.paymentState, "failed");
    assert.deepEqual(result.currentCard, card);
    await subscriptions.getStripeSubscriptionPaymentAction({...references, ...untrusted});
    await subscriptions.retryStripeSubscriptionPayment({...references, ...untrusted, idempotencyReference: "attempt"});
    await subscriptions.createStripeSubscriptionCardSetup({...references, ...untrusted, idempotencyReference: "setup-attempt"});
    await subscriptions.updateStripeSubscriptionPaymentMethod({...references, ...untrusted, setupIntentReference: "seti_new"});
    assert.deepEqual(calls, [
      {name: "getStripeSubscriptionPaymentDetails", options: {timeout: 150000}, data: references},
      {name: "getStripeSubscriptionPaymentAction", options: undefined, data: references},
      {name: "retryStripeSubscriptionPayment", options: {timeout: 120000},
        data: {...references, idempotencyReference: "attempt"}},
      {name: "createStripeSetupIntent", options: undefined,
        data: {subscriptionReference: "sub_owner", idempotencyReference: "setup-attempt"}},
      {name: "updateStripeSubscriptionPaymentMethod", options: undefined,
        data: {...references, setupIntentReference: "seti_new"}}
    ]);
    // Existing callers also route subscription operations through this feature.
    assert.strictEqual(payments.getStripeSubscriptionPaymentDetails, subscriptions.getStripeSubscriptionPaymentDetails);
    assert.strictEqual(payments.getStripeSubscriptionPaymentAction, subscriptions.getStripeSubscriptionPaymentAction);
    assert.strictEqual(payments.retryStripeSubscriptionPayment, subscriptions.retryStripeSubscriptionPayment);
    assert.strictEqual(payments.updateStripeSubscriptionPaymentMethod, subscriptions.updateStripeSubscriptionPaymentMethod);
    await payments.createStripeSetupIntent({subscriptionReference: "sub_owner", idempotencyReference: "legacy-attempt"});
    assert.deepEqual(calls.at(-1).data, {subscriptionReference: "sub_owner", idempotencyReference: "legacy-attempt"});
  } finally {
    if (previousFirebase === undefined) delete globalThis.firebase;
    else globalThis.firebase = previousFirebase;
    if (previousStripe) Object.defineProperty(globalThis, "Stripe", previousStripe);
    else delete globalThis.Stripe;
  }
});

test("subscription card setup rejects invalid references and incomplete backend results", async () => {
  let calls = 0;
  let response = {setupIntentReference: "seti_new", clientSecret: "seti_new_secret_private"};
  const api = new CreateStripeSubscriptionCardSetup({async createSubscriptionCardSetup() {calls++; return response;}});
  for (const invalid of [{subscriptionReference: "cus_wrong", idempotencyReference: "attempt"},
    {subscriptionReference: "sub_owner", idempotencyReference: ""},
    {subscriptionReference: "sub_owner", idempotencyReference: "x".repeat(501)}]) {
    await assert.rejects(() => api.execute(invalid));
  }
  assert.equal(calls, 0);
  for (const invalid of [null, {setupIntentReference: "pi_wrong", clientSecret: "secret"},
    {setupIntentReference: "seti_new", clientSecret: ""}]) {
    response = invalid;
    await assert.rejects(() => api.execute({subscriptionReference: "sub_owner", idempotencyReference: "attempt"}), /setup response/);
  }
});


test("family card setup forwards explicit scope without accepting a client target list", async () => {
  const calls = [];
  const api = new CreateStripeSubscriptionCardSetup({async createSubscriptionCardSetup(input) {
    calls.push(input); return {setupIntentReference: "seti_family", clientSecret: "seti_family_secret_private",
      cardChangeTargets: [{subscriptionReference: "sub_owner", studentId: "student-a", studentName: "Alice"}]};
  }});
  await api.execute({subscriptionReference: "sub_owner", idempotencyReference: "family-attempt", cardChangeScope: "all_students",
    subscriptionReferences: ["sub_someone_else"], customerReference: "cus_forged"});
  assert.deepEqual(calls[0], {subscriptionReference: "sub_owner", idempotencyReference: "family-attempt", cardChangeScope: "all_students"});
  await assert.rejects(() => api.execute({subscriptionReference: "sub_owner", idempotencyReference: "attempt", cardChangeScope: "bogus"}));
  assert.equal(calls.length, 1);
});
