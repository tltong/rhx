import assert from "node:assert/strict";
import {test} from "node:test";
import {ListStripeCustomers} from "./application/list_stripe_customers.js";
import {FirebaseCallableStripePaymentGateway} from "./infrastructure/firebase_callable_stripe_payment_gateway.js";

test("customer listing uses the authenticated Firebase callable without a caller-supplied mode", async () => {
  const expected = {mode: "test", customers: [{customerReference: "cus_fixture", email: "person@example.test"}]};
  const gateway = new FirebaseCallableStripePaymentGateway({getApp: () => ({functions: region => {
    assert.equal(region, "us-central1");
    return {httpsCallable: name => async input => {assert.equal(name, "listStripeCustomers"); assert.deepEqual(input, {}); return {data: expected};}};
  }})});
  assert.deepEqual(await new ListStripeCustomers(gateway).execute(), expected);
});
test("invalid responses cannot supply selectable customers, and extra fields are omitted", async () => {
  for (const result of [null, {}, {mode: "other", customers: []}, {mode: "prod", customers: [{}]}]) {
    await assert.rejects(() => new ListStripeCustomers({listCustomers: async () => result}).execute());
  }
  const result = await new ListStripeCustomers({listCustomers: async () => ({mode: "prod", customers: [{customerReference: "cus_live", email: null, privateData: "private"}]})}).execute();
  assert.deepEqual(result, {mode: "prod", customers: [{customerReference: "cus_live", email: null}]});
});
