import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CreatePaymentCustomer
} from "./application/create_payment_customer.js?v=20260903-stripe-customer-test-v1";
import {
  DeletePaymentCustomer
} from "./application/delete_payment_customer.js?v=20260903-stripe-customer-test-v1";
import {
  CreateStripeSetupIntent
} from "./application/create_setup_intent.js?v=20260904-stripe-setup-intent-v1";
import {
  FirebaseCallableStripePaymentGateway
} from "./infrastructure/firebase_callable_stripe_payment_gateway.js?v=20260904-stripe-setup-intent-v1";
import * as stripePaymentModule from
  "./stripe_payment_module.js?v=20260904-stripe-setup-intent-v1";

test("web Stripe payment module exposes customer operations", () => {
  assert.equal(
    typeof stripePaymentModule.createPaymentCustomer,
    "function"
  );
  assert.equal(typeof stripePaymentModule.deleteCustomer, "function");
  assert.equal(
    typeof stripePaymentModule.createStripeSetupIntent,
    "function"
  );
});

test("customer use cases pass normalized references to the gateway", async () => {
  const calls = [];
  const gateway = {
    async createCustomer(inputReference) {
      calls.push({operation: "create", inputReference});
      return "cus_created";
    },
    async deleteCustomer(customerReference) {
      calls.push({operation: "delete", customerReference});
      return customerReference;
    }
  };

  const createUseCase = new CreatePaymentCustomer(gateway);
  const deleteUseCase = new DeletePaymentCustomer(gateway);

  assert.equal(
    await createUseCase.execute(" client-123 "),
    "cus_created"
  );
  assert.equal(
    await deleteUseCase.execute(" cus_created "),
    "cus_created"
  );
  assert.deepEqual(calls, [
    {
      operation: "create",
      inputReference: "client-123"
    },
    {
      operation: "delete",
      customerReference: "cus_created"
    }
  ]);
});

test("SetupIntent use case returns the gateway client secret", async () => {
  const calls = [];
  const useCase = new CreateStripeSetupIntent({
    async createSetupIntent(customerReference) {
      calls.push(customerReference);
      return "seti_secret_web";
    }
  });

  assert.equal(
    await useCase.execute(" cus_web_setup "),
    "seti_secret_web"
  );
  assert.deepEqual(calls, ["cus_web_setup"]);
});

test("Firebase gateway calls all Stripe payment callables", async () => {
  const calls = [];
  const gateway = new FirebaseCallableStripePaymentGateway({
    getApp() {
      return {
        functions(region) {
          assert.equal(region, "us-central1");

          return {
            httpsCallable(functionName) {
              return async (data) => {
                calls.push({functionName, data});
                return {
                  data: functionName === "createPaymentCustomer"
                    ? "cus_gateway"
                    : functionName === "createStripeSetupIntent"
                      ? "seti_secret_gateway"
                      : data.customerReference
                };
              };
            }
          };
        }
      };
    }
  });

  assert.equal(
    await gateway.createCustomer("client-gateway"),
    "cus_gateway"
  );
  assert.equal(
    await gateway.deleteCustomer("cus_gateway"),
    "cus_gateway"
  );
  assert.equal(
    await gateway.createSetupIntent("cus_gateway"),
    "seti_secret_gateway"
  );
  assert.deepEqual(calls, [
    {
      functionName: "createPaymentCustomer",
      data: {inputReference: "client-gateway"}
    },
    {
      functionName: "deleteCustomer",
      data: {customerReference: "cus_gateway"}
    },
    {
      functionName: "createStripeSetupIntent",
      data: {customerReference: "cus_gateway"}
    }
  ]);
});

test("Stripe test page is protected and linked from Site Admin", () => {
  const pageHtml = fs.readFileSync(
    new URL(
      "./pages/admin/stripe_payment_test.html",
      import.meta.url
    ),
    "utf8"
  );
  const siteAdminHtml = fs.readFileSync(
    new URL(
      "../site_admin/pages/site_admin/site_admin.html",
      import.meta.url
    ),
    "utf8"
  );
  const pageScript = fs.readFileSync(
    new URL(
      "./pages/admin/stripe_payment_test.js",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(pageHtml, /data-site-admin-page/);
  assert.match(pageHtml, /id="create-customer-form"/);
  assert.match(pageHtml, /id="setup-intent-form"/);
  assert.match(pageHtml, /id="setup-intent-client-secret"/);
  assert.match(pageHtml, /id="delete-customer-form"/);
  assert.match(pageHtml, /id="payment-mode"/);
  assert.match(pageScript, /getPaymentConfig/);
  assert.match(pageScript, /createStripeSetupIntent/);
  assert.match(
    pageScript,
    /setupIntentClientSecret\.textContent = clientSecret/
  );
  assert.equal(
    siteAdminHtml.includes(
      "/features/stripe_payment/pages/admin/stripe_payment_test.html"
    ),
    true
  );
});
