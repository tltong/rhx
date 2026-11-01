import assert from "node:assert/strict";
import {test} from "node:test";
import {ManageGuardianSubscriptions} from "./application/manage_guardian_subscriptions.js";
import {FirebaseCallableStripeSubscriptionPaymentGateway} from "./infrastructure/firebase_callable_stripe_subscription_payment_gateway.js";

test("guardian options use schema reads by default and strictly forward explicit refresh", async () => {
  const seen = [];
  const api = new ManageGuardianSubscriptions({getGuardianSubscriptionOptions: async input => {seen.push(input); return {...options,
    syncState: {state: "pending", lastConfirmedAt: null}};}});
  assert.equal((await api.getOptions({studentId: "student-a", customerReference: "forged"})).syncState.state, "pending");
  await api.getOptions({studentId: "student-a", refreshFromStripe: true});
  assert.deepEqual(seen, [{studentId: "student-a"}, {studentId: "student-a", refreshFromStripe: true}]);
  await assert.rejects(api.getOptions({refreshFromStripe: "true"}));
});
const quoteReference = "a".repeat(64);
const input = {studentId: "student-a", planId: "monthly", quoteReference, idempotencyReference: "checkout"};
const options = {students: [{studentId: "student-a", studentName: "Alice", country: "Malaysia", pin: "private"}],
  selectedStudentId: "student-a", paymentMode: "prod", subscriptionReference: null, canCreate: true,
  plans: [{planId: "monthly", name: "Monthly", months: 1, amount: 2500, currency: "myr", quoteReference}],
  savedCard: {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030, paymentMethodReference: "pm_saved", secret: "private"}};
test("guardian subscription APIs pass only selected references and whitelist returned student/card data", async () => {
  const calls = [], api = new ManageGuardianSubscriptions({getGuardianSubscriptionOptions: async value => {calls.push(value); return options;}});
  const result = await api.getOptions({studentId: "student-a", customerReference: "forged"});
  assert.deepEqual(calls, [{studentId: "student-a"}]); assert.equal(result.canCreate, true);
  assert.equal(JSON.stringify(result).includes("private"), false); assert.equal(result.savedCard.paymentMethodReference, "pm_saved");
});
test("new checkout APIs retain their attempt/quote and never send client-selected amount or customer", async () => {
  const calls = [], api = new ManageGuardianSubscriptions({prepareStudentSubscription: async value => {
    calls.push(value); return {setupIntentReference: "seti_new", clientSecret: "seti_new_secret_local"};},
  createStudentSubscription: async value => {calls.push(value); return {subscriptionReference: "sub_new", status: "incomplete", paymentClientSecret: "private"};}});
  await api.prepare({...input, amount: 1, customerReference: "cus_forged"});
  assert.deepEqual(calls[0], input);
  const result = await api.create({...input, savedCardReference: "pm_saved", country: "forged"});
  assert.deepEqual(calls[1], {...input, savedCardReference: "pm_saved"});
  assert.deepEqual(result, {subscriptionReference: "sub_new", status: "incomplete"});
});
test("student option responses cannot select an unlisted student or supply invalid amounts", async () => {
  for (const value of [{...options, selectedStudentId: "foreign"}, {...options, plans: [{...options.plans[0], amount: -1}]},
    {...options, subscriptionReference: "not-stripe"}]) {
    const api = new ManageGuardianSubscriptions({getGuardianSubscriptionOptions: async () => value});
    await assert.rejects(() => api.getOptions());
  }
});
test("new guardian gateways call authenticated subscription endpoints", async () => {
  const calls = [], gateway = new FirebaseCallableStripeSubscriptionPaymentGateway({getApp: () => ({functions: region => {
    assert.equal(region, "us-central1"); return {httpsCallable: name => async data => {calls.push({name, data}); return {data: {}};}};}})});
  await gateway.getGuardianSubscriptionOptions({studentId: "student-a"});
  await gateway.prepareStudentSubscription(input); await gateway.createStudentSubscription(input);
  await gateway.changeStudentSubscriptionPlan(input);
  assert.deepEqual(calls.map(call => call.name), ["getStripeGuardianSubscriptionOptions", "prepareStripeStudentSubscription", "createStripeStudentSubscription", "changeStripeStudentSubscriptionPlan"]);
});
test("future plan changes use the subscription feature and normalize the confirmed next renewal", async () => {
  let seen;
  const api = new ManageGuardianSubscriptions({changeStudentSubscriptionPlan: async value => {seen = value; return {...options,
    subscriptionReference: "sub_one", canCreate: false, canChangePlan: true, nextRenewalAt: "2030-12-01T00:00:00Z",
    nextPlan: {state: "scheduled", planId: "monthly", effectiveAt: "2030-12-01T00:00:00Z"}};}});
  const result = await api.changePlan({...input, customerReference: "forged", amount: 1});
  assert.deepEqual(seen, input); assert.equal(result.nextPlan.state, "scheduled"); assert.equal(result.canCreate, false);
});
