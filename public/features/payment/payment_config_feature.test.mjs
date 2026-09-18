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
import * as paymentModule from "./payment_module.js?v=20260901-payment-config-simple-v1";

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
