const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CreatePaymentProvider,
} = require("./application/create_payment_provider");

test("payment factory selects Stripe using the configured mode", async () => {
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

  assert.equal(await useCase.execute(), payment);
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
