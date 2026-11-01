const {test} = require("node:test");
const assert = require("node:assert/strict");
const {resumePrepaid, payment, createDraft} = require("./domain/stripe_renewal_episode");
function fixture() {
  const e = {id: "episode", studentId: "student", mode: "test", customerReference: "cus_one", subscriptionReference: "sub_one",
    attempt: {id: "attempt", priceReference: "price_new", paidAt: new Date("2030-01-01"), paidThrough: new Date("2030-02-01"),
      paidPaymentMethodReference: "pm_one", paymentIntentReference: "pi_one", terms: {amount: 2500, currency: "myr"}}};
  const f = {e, resumes: 0, updates: 0, s: {id: "sub_one", customer: "cus_one", livemode: false,
    status: "paused", metadata: {rhx_episode: e.id}, items: {data: [{id: "si_one", quantity: 1, price: {id: "price_old"}}]}}};
  f.client = {
    customers: {retrieve: async () => ({balance: f.creditBalance || 0})},
    subscriptions: {retrieve: async () => structuredClone(f.s), update: async (_id, params) => {
      f.updates++;
      if (params.trial_end && f.failBridge) {f.failBridge = false; throw Error("Bridge temporarily unavailable");}
      for (const item of params.items || []) {f.s.items.data[0].quantity = item.quantity; if (item.price) f.s.items.data[0].price.id = item.price;}
      Object.assign(f.s.metadata, params.metadata);
      if (params.trial_end) {f.s.status = "trialing"; f.s.trial_end = params.trial_end; f.s.pause_collection = null;}
      if (params.trial_end && f.loseBridgeResponse) {f.loseBridgeResponse = false; throw Error("Lost bridge response");}
      return structuredClone(f.s);
    }},
    rawRequest: async () => {f.resumes++; assert.equal(f.s.items.data[0].quantity, 0); f.s.status = "active"; return structuredClone(f.s);},
    paymentMethods: {retrieve: async () => ({id: "pm_one", customer: "cus_one", type: "card"})},
    paymentIntents: {retrieve: async () => ({id: "pi_one", customer: "cus_one", livemode: false,
      metadata: {rhx_episode: e.id, rhx_attempt: e.attempt.id, rhx_subscription: e.subscriptionReference, rhx_student: e.studentId, rhx_recovery_version: "2"},
      amount: 2500, amount_received: f.received ?? 2500, currency: "myr", status: "succeeded",
      latest_charge: {balance_transaction: {created: 1893456000}}, payment_method: "pm_one"})},
  };
  return f;
}
test("an interrupted restart leaves zero quantity so Stripe cannot collect another period", async () => {
  const f = fixture(); f.failBridge = true;
  await assert.rejects(() => resumePrepaid(f.client, f.e), /temporarily/);
  assert.equal(f.s.status, "active"); assert.equal(f.s.items.data[0].quantity, 0); assert.equal(f.resumes, 1);
  await resumePrepaid(f.client, f.e);
  assert.equal(f.s.items.data[0].quantity, 1); assert.equal(f.s.items.data[0].price.id, "price_new");
  assert.equal(f.s.trial_end, +f.e.attempt.paidThrough / 1000); assert.equal(f.resumes, 1);
});
test("a lost bridge response is verified without another resume or update", async () => {
  const f = fixture(); f.loseBridgeResponse = true;
  await assert.rejects(() => resumePrepaid(f.client, f.e), /Lost bridge/); const count = f.updates;
  await resumePrepaid(f.client, f.e); assert.equal(f.updates, count); assert.equal(f.resumes, 1);
});
test("another recovery cannot take over the subscription", async () => {
  const f = fixture(); f.s.metadata.rhx_episode = "another";
  await assert.rejects(() => resumePrepaid(f.client, f.e), /Another recovery/); assert.equal(f.updates, 0);
});
test("partial or mismatched received amounts cannot prove a paid period", async () => {
  const f = fixture(); f.received = 1000;
  await assert.rejects(() => payment(f.client, f.e), /payment amount/);
});
test("customer credit balances are rejected before creating or collecting a recovery invoice", async () => {
  const f = fixture(); f.creditBalance = -1000;
  await assert.rejects(() => createDraft(f.client, f.e), /credits need billing review/);
  assert.equal(f.resumes, 0); assert.equal(f.updates, 0);
});
