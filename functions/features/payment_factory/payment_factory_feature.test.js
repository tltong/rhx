const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CreatePaymentProvider,
} = require("./application/create_payment_provider");

test("payment factory returns the provider and its configuration context", async () => {
  const payment = {createCustomer() {}};
  const calls = [];
  const useCase = new CreatePaymentProvider({
    async getPaymentConfig() {
      return {
        provider: "stripe",
        mode: "prod",
      };
    },
    providerFactories: {
      stripe(input) {
        calls.push(input);
        return payment;
      },
    },
  });

  const context = await useCase.executeWithContext();

  assert.equal(context.paymentProvider, payment);
  assert.equal(context.providerName, "stripe");
  assert.equal(context.mode, "prod");
  assert.equal(Object.isFrozen(context), true);
  assert.deepEqual(calls, [{mode: "prod"}]);
});

test("payment factory rejects missing configuration", async () => {
  const useCase = new CreatePaymentProvider({
    async getPaymentConfig() {
      return null;
    },
    providerFactories: {},
  });

  await assert.rejects(
    () => useCase.execute(),
    /Payment configuration is not available/,
  );
});

test("payment factory rejects an unsupported provider", async () => {
  const useCase = new CreatePaymentProvider({
    async getPaymentConfig() {
      return {
        provider: "unknown",
        mode: "test",
      };
    },
    providerFactories: {},
  });

  await assert.rejects(
    () => useCase.execute(),
    /Unsupported payment provider: unknown/,
  );
});

test("stored renewal mode creates its provider without using the current default config", () => {
  const payment = {};
  const useCase = new CreatePaymentProvider({getPaymentConfig() {throw Error("Must not use the mutable default mode");},
    providerFactories: {stripe(input) {assert.deepEqual(input, {mode: "prod"}); return payment;}}});
  assert.equal(useCase.executeForContext({providerName: "stripe", mode: "prod"}).paymentProvider, payment);
  assert.throws(() => useCase.executeForContext({providerName: "stripe", mode: "unknown"}), /mode/);
});
