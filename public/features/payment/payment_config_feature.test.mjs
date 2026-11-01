import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  SavePaymentConfig
} from "./application/save_payment_config.js?v=20260901-payment-config-simple-v1";
import {
  PaymentConfig,
  paymentModes,
  paymentProviders
} from "./domain/payment_config.js?v=20260901-payment-config-simple-v1";
import * as paymentModule from "./payment_module.js?v=20261031-renewal-restart-v1";

const validInput = {
  provider: "Stripe",
  mode: paymentModes.TEST,

  customData: {
    checkoutStyle: "hosted"
  }
};

test("payment module exposes configuration APIs and enums", () => {
  assert.equal(typeof paymentModule.getPaymentConfig, "function");
  assert.equal(typeof paymentModule.savePaymentConfig, "function");
  assert.deepEqual(paymentModule.paymentModes, {
    TEST: "test",
    PROD: "prod"
  });
  assert.deepEqual(paymentModule.paymentProviders, {
    STRIPE: "stripe"
  });
});

test("payment config normalizes the admin-defined provider", () => {
  const config = new PaymentConfig(validInput);

  assert.equal(config.provider, "stripe");
  assert.equal(config.mode, paymentModes.TEST);
  assert.deepEqual(config.customData, {
    checkoutStyle: "hosted"
  });
});

test("payment config rejects providers outside the enum", () => {
  assert.throws(
    () => new PaymentConfig({
      ...validInput,
      provider: "another-provider"
    }),
    /provider must be one of: stripe/
  );
  assert.equal(paymentProviders.STRIPE, "stripe");
});

test("save payment config assigns the update timestamp", async () => {
  let savedConfig = null;
  const useCase = new SavePaymentConfig({
    async save(config) {
      savedConfig = config;
      return config;
    }
  });

  const result = await useCase.execute(validInput);

  assert.equal(result, savedConfig);
  assert.ok(result.updatedAt instanceof Date);
});

test("retry settings survive feature saves and reject invalid limits and intervals", async () => {
  let saved;
  const useCase = new SavePaymentConfig({async save(config) {saved = config; return config;}});
  await useCase.execute({...validInput, renewalRetryPolicy: {maxRetries: 5, intervalHours: 12}});
  assert.deepEqual(saved.renewalRetryPolicy, {maxRetries: 5, intervalHours: 12, gracePeriodHours: 72});
  assert.deepEqual(new PaymentConfig(validInput).renewalRetryPolicy, {maxRetries: 3, intervalHours: 24, gracePeriodHours: 72});
  for (const policy of [{maxRetries: -1, intervalHours: 24}, {maxRetries: 11, intervalHours: 24},
    {maxRetries: 3, intervalHours: 0}, {maxRetries: 3, intervalHours: 1.5}]) {
    await assert.rejects(() => useCase.execute({...validInput, renewalRetryPolicy: policy}), /retry policy/);
  }
});

test("payment admin page is protected and linked from Site Admin", () => {
  const pageHtml = fs.readFileSync(
    new URL("./pages/admin/payment_admin.html", import.meta.url),
    "utf8"
  );
  const siteAdminHtml = fs.readFileSync(
    new URL("../site_admin/pages/site_admin/site_admin.html", import.meta.url),
    "utf8"
  );

  assert.match(pageHtml, /data-site-admin-page/);
  assert.match(pageHtml, /site_admin_page_loader\.js/);
  assert.match(
    pageHtml,
    /<select id="payment-provider" name="provider" required><\/select>/
  );
  assert.match(
    siteAdminHtml,
    /\/features\/payment\/pages\/admin\/payment_admin\.html/
  );
});

test("grace period accepts only whole hours within the configured range", () => {
  for (const gracePeriodHours of [1, 72, 1680]) {
    const policy = {maxRetries: 3, intervalHours: 24, gracePeriodHours};
    assert.equal(new PaymentConfig({...validInput, renewalRetryPolicy: policy}).renewalRetryPolicy.gracePeriodHours, gracePeriodHours);
  }
  for (const gracePeriodHours of [0, -1, 1681, 1.5, "72", null]) {
    assert.throws(() => new PaymentConfig({...validInput, renewalRetryPolicy: {maxRetries: 3, intervalHours: 24, gracePeriodHours}}), /grace period/);
  }
});
