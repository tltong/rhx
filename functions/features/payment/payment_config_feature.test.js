const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GetPaymentConfig,
} = require("./application/get_payment_config");
const {
  PaymentConfig,
  paymentModes,
  paymentProviders,
} = require("./domain/payment_config");
const {
  FirestorePaymentConfigRepository,
} = require("./infrastructure/firestore_payment_config_repository");
const paymentModule = require("./payment_module");

const record = {
  provider: "stripe",
  mode: "test",

  customData: {},
  updatedAt: new Date("2026-09-01T00:00:00Z"),
};

test("Functions payment module exposes its read-only API", () => {
  assert.equal(typeof paymentModule.getPaymentConfig, "function");
  assert.deepEqual(paymentModule.paymentModes, {
    TEST: "test",
    PROD: "prod",
  });
  assert.deepEqual(paymentModule.paymentProviders, {
    STRIPE: "stripe",
  });
});

test("Functions payment config rejects unsupported providers", () => {
  assert.throws(
    () => new PaymentConfig({
      ...record,
      provider: "unsupported",
    }),
    /provider must be one of: stripe/,
  );
  assert.equal(paymentProviders.STRIPE, "stripe");
});

test("Functions repository reads the default payment config", async () => {
  const calls = [];
  const repository = new FirestorePaymentConfigRepository({
    async readDocument(collection, documentId) {
      calls.push({ collection, documentId });
      return record;
    },
  });
  const useCase = new GetPaymentConfig(repository);
  const result = await useCase.execute();

  assert.ok(result instanceof PaymentConfig);
  assert.equal(result.provider, "stripe");
  assert.equal(result.mode, paymentModes.TEST);
  assert.deepEqual(calls, [{
    collection: "paymentConfigs",
    documentId: "default",
  }]);
});

test("Functions repository returns null when config is absent", async () => {
  const repository = new FirestorePaymentConfigRepository({
    async readDocument() {
      return null;
    },
  });

  assert.equal(await repository.get(), null);
});
