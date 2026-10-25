const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createListStripeCustomersHandler} = require("./stripe_customer_list");
const administrator = {auth: {uid: "admin", token: {email: "ADMIN@example.test", email_verified: true}}};

test("customer listing requires a verified administrator before reading customer data", async () => {
  let reads = 0;
  const handler = createListStripeCustomersHandler({checkAdmin: async email => email === "admin@example.test",
    loadConfig: async () => {reads++; return {provider: "stripe", mode: "test"};}, listCustomers: async () => []});
  for (const [request, code] of [[{}, "unauthenticated"], [{auth: {uid: "user", token: {}}}, "permission-denied"],
    [{auth: {uid: "admin", token: {...administrator.auth.token, email_verified: false}}}, "permission-denied"],
    [{auth: {uid: "other", token: {email: "other@example.test", email_verified: true}}}, "permission-denied"]]) {
    await assert.rejects(() => handler(request), {code});
  }
  assert.equal(reads, 0);
});
test("the configured mode selects the customer collection and only dropdown fields are returned", async () => {
  for (const mode of ["test", "prod"]) {
    const handler = createListStripeCustomersHandler({checkAdmin: async () => true,
      loadConfig: async () => ({provider: "stripe", mode}), listCustomers: async input => {
        assert.deepEqual(input, {mode});
        return [{customerReference: "cus_b", email: "b@example.test", internalReference: "private-guardian", card: "private-card"},
          {customerReference: "cus_a", email: "a@example.test"}];
      }});
    assert.deepEqual(await handler({...administrator, data: {mode: mode === "test" ? "prod" : "test"}}), {
      mode, customers: [{customerReference: "cus_a", email: "a@example.test"}, {customerReference: "cus_b", email: "b@example.test"}],
    });
  }
});
test("missing configuration and backend failures return safe errors", async () => {
  for (const config of [null, {provider: "other", mode: "test"}, {provider: "stripe", mode: "other"}]) {
    const handler = createListStripeCustomersHandler({checkAdmin: async () => true, loadConfig: async () => config});
    await assert.rejects(() => handler(administrator), {code: "failed-precondition"});
  }
  const logs = [];
  const handler = createListStripeCustomersHandler({checkAdmin: async () => true,
    loadConfig: async () => ({provider: "stripe", mode: "test"}), listCustomers: async () => {throw new Error("private-record");},
    log: {error: (...args) => logs.push(args)}});
  await assert.rejects(() => handler(administrator), e => e.code === "internal" && !e.message.includes("private-record"));
  assert.equal(JSON.stringify(logs).includes("private-record"), false);
});
