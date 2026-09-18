import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CreatePaymentCustomer
} from "./application/create_payment_customer.js?v=20260906-stripe-customer-email-v1";
import {
  DeletePaymentCustomer
} from "./application/delete_payment_customer.js?v=20260906-stripe-customer-email-v1";
import {
  CreateStripeSetupIntent
} from "./application/create_setup_intent.js?v=20260906-stripe-customer-email-v1";
import {
  CreateStripeSubscription
} from "./application/create_subscription.js?v=20260911-stripe-subscription-v1";
import {
  GetStripeClientConfig
} from "./application/get_stripe_client_config.js?v=20260906-stripe-client-config-v1";
import {
  MountStripeSetupPaymentElement
} from "./application/mount_setup_payment_element.js?v=20260907-stripe-setup-context-v1";
import {
  ConfirmStripeSetup
} from "./application/confirm_setup.js?v=20260907-stripe-setup-context-v1";
import {
  RetrieveStripeSetupIntent
} from "./application/retrieve_setup_intent.js?v=20260906-confirm-setup-redirect-v1";
import {
  BrowserStripeSetupGateway
} from "./infrastructure/browser_stripe_setup_gateway.js?v=20260907-stripe-setup-context-v1";
import {
  FirebaseCallableStripePaymentGateway
} from "./infrastructure/firebase_callable_stripe_payment_gateway.js?v=20260906-stripe-customer-email-v1";
import * as stripePaymentModule from
  "./stripe_payment_module.js?v=20260906-stripe-customer-email-v1";

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
  assert.equal(
    typeof stripePaymentModule.createStripeSubscription,
    "function"
  );
  assert.equal(
    typeof stripePaymentModule.getStripeClientConfig,
    "function"
  );
  assert.equal(typeof stripePaymentModule.confirmSetup, "function");
  assert.equal(typeof stripePaymentModule.retrieveSetupIntent, "function");
  assert.equal(
    typeof stripePaymentModule.mountSetupPaymentElement,
    "function"
  );
});

test("customer use cases pass normalized references to the gateway", async () => {
  const calls = [];
  const gateway = {
    async createCustomer(inputReference, email) {
      calls.push({operation: "create", inputReference, email});
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
    await createUseCase.execute(" client-123 ", " client@example.com "),
    "cus_created"
  );
  assert.equal(
    await deleteUseCase.execute(" cus_created "),
    "cus_created"
  );
  assert.deepEqual(calls, [
    {
      operation: "create",
      inputReference: "client-123",
      email: "client@example.com"
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

test("subscription use case normalizes the callable contract", async () => {
  const calls = [];
  const useCase = new CreateStripeSubscription({
    async createSubscription(input) {
      calls.push(input);
      return {
        subscriptionReference: "sub_web",
        status: "incomplete",
        paymentClientSecret: "pi_web_secret"
      };
    }
  });

  const result = await useCase.execute({
    studentId: " student-web ",
    customerReference: " cus_web ",
    paymentMethodReference: " pm_web ",
    country: " Malaysia ",
    planId: " plan-quarterly ",
    idempotencyReference: " checkout-attempt-web "
  });

  assert.deepEqual(calls, [{
    studentId: "student-web",
    customerReference: "cus_web",
    paymentMethodReference: "pm_web",
    country: "Malaysia",
    planId: "plan-quarterly",
    idempotencyReference: "checkout-attempt-web"
  }]);
  assert.deepEqual(result, {
    subscriptionReference: "sub_web",
    status: "incomplete",
    paymentClientSecret: "pi_web_secret"
  });
  assert.equal(Object.isFrozen(result), true);
});

test("Stripe client config use case validates the callable response", async () => {
  const useCase = new GetStripeClientConfig({
    async getClientConfig() {
      return {
        provider: "STRIPE",
        mode: "TEST",
        publishableKey: "pk_test_web"
      };
    }
  });

  const result = await useCase.execute();

  assert.deepEqual(result, {
    provider: "stripe",
    mode: "test",
    publishableKey: "pk_test_web"
  });
  assert.equal(Object.isFrozen(result), true);
});

test("mount SetupIntent returns a copyable context reference", async () => {
  const calls = [];
  const useCase = new MountStripeSetupPaymentElement({
    async getStripeClientConfig() {
      calls.push(["config"]);
      return {
        mode: "test",
        publishableKey: "pk_test_mount"
      };
    },
    stripeSetupGateway: {
      async mountPaymentElement(input) {
        calls.push(["mount", input]);
        return "stripe_setup_context_mount";
      }
    }
  });

  const result = await useCase.execute({
    clientSecret: " seti_secret_mount ",
    containerSelector: " #payment-element "
  });

  assert.deepEqual(result, {
    contextReference: "stripe_setup_context_mount",
    mode: "test"
  });
  assert.deepEqual(calls, [
    ["config"],
    ["mount", {
      publishableKey: "pk_test_mount",
      clientSecret: "seti_secret_mount",
      containerSelector: "#payment-element",
      mode: "test"
    }]
  ]);
});

test("confirm SetupIntent use case returns a normalized outcome", async () => {
  const calls = [];
  const useCase = new ConfirmStripeSetup({
    async confirmSetup(input) {
      calls.push(input);
      return {
        id: "seti_confirmed",
        status: "succeeded",
        payment_method: {id: "pm_confirmed"}
      };
    }
  });

  const result = await useCase.execute({
    contextReference: " stripe_setup_context_confirmed ",
    returnUrl: "https://readyherox.web.app/payment-complete"
  });

  assert.deepEqual(result, {
    setupIntentReference: "seti_confirmed",
    status: "succeeded",
    paymentMethodReference: "pm_confirmed"
  });
  assert.deepEqual(calls, [{
    contextReference: "stripe_setup_context_confirmed",
    returnUrl: "https://readyherox.web.app/payment-complete"
  }]);
});

test("retrieve SetupIntent use case returns a normalized outcome", async () => {
  const calls = [];
  const useCase = new RetrieveStripeSetupIntent({
    async getStripeClientConfig() {
      return {
        mode: "test",
        publishableKey: "pk_test_retrieve"
      };
    },
    stripeSetupGateway: {
      async retrieveSetupIntent(input) {
        calls.push(input);
        return {
          id: "seti_return",
          status: "succeeded",
          payment_method: "pm_return"
        };
      }
    }
  });

  const result = await useCase.execute({
    clientSecret: " seti_secret_return "
  });

  assert.deepEqual(result, {
    setupIntentReference: "seti_return",
    status: "succeeded",
    paymentMethodReference: "pm_return"
  });
  assert.deepEqual(calls, [{
    publishableKey: "pk_test_retrieve",
    clientSecret: "seti_secret_return"
  }]);
});

test("browser Stripe gateway mounts, validates, and confirms", async () => {
  const calls = [];
  const paymentElement = {
    mount(target) {
      calls.push(["mount", target]);
    },
    unmount() {
      calls.push(["unmount"]);
    }
  };
  const elements = {
    create(type) {
      calls.push(["create", type]);
      return paymentElement;
    },
    async submit() {
      calls.push(["submit"]);
      return {};
    }
  };
  const stripe = {
    elements(options) {
      calls.push(["elements", options]);
      return elements;
    },
    async confirmSetup(options) {
      calls.push(["confirm", options]);
      return {
        setupIntent: {
          id: "seti_browser",
          status: "succeeded",
          payment_method: "pm_browser"
        }
      };
    }
  };
  const gateway = new BrowserStripeSetupGateway({
    stripeFactory(publishableKey) {
      calls.push(["stripe", publishableKey]);
      return stripe;
    },
    contextReferenceFactory() {
      return "stripe_setup_context_browser";
    }
  });

  const contextReference = await gateway.mountPaymentElement({
    publishableKey: "pk_test_browser",
    clientSecret: "seti_secret_browser",
    containerSelector: "#payment-element",
    mode: "test"
  });
  const setupIntent = await gateway.confirmSetup({
    contextReference,
    returnUrl: "https://readyherox.web.app/return"
  });

  assert.equal(setupIntent.id, "seti_browser");
  assert.deepEqual(calls.slice(0, 4), [
    ["stripe", "pk_test_browser"],
    ["elements", {clientSecret: "seti_secret_browser"}],
    ["create", "payment"],
    ["mount", "#payment-element"]
  ]);
  assert.deepEqual(calls[4], ["submit"]);
  assert.equal(calls[5][0], "confirm");
  assert.equal(calls[5][1].elements, elements);
  assert.equal(calls[5][1].clientSecret, "seti_secret_browser");
  assert.deepEqual(calls[5][1].confirmParams, {
    return_url: "https://readyherox.web.app/return"
  });
  assert.equal(calls[5][1].redirect, "if_required");
  assert.deepEqual(calls[6], ["unmount"]);
  assert.equal(gateway.setupContexts.size, 0);
});

test("browser Stripe gateway rejects an unknown context reference", async () => {
  const gateway = new BrowserStripeSetupGateway();

  await assert.rejects(
    () => gateway.confirmSetup({
      contextReference: "stripe_setup_context_missing",
      returnUrl: "https://readyherox.web.app/return"
    }),
    /not found or has expired/
  );
});

test("browser Stripe gateway keeps multiple setup contexts separate", async () => {
  const confirmations = [];
  let contextSequence = 0;
  const gateway = new BrowserStripeSetupGateway({
    stripeFactory(publishableKey) {
      const suffix = publishableKey.endsWith("one") ? "one" : "two";
      const elements = {
        create() {
          return {mount() {}, unmount() {}};
        },
        async submit() {}
      };

      return {
        elements() {
          return elements;
        },
        async confirmSetup({clientSecret}) {
          confirmations.push({suffix, clientSecret});
          return {
            setupIntent: {
              id: `seti_${suffix}`,
              status: "succeeded",
              payment_method: `pm_${suffix}`
            }
          };
        }
      };
    },
    contextReferenceFactory() {
      contextSequence += 1;
      return `stripe_setup_context_${contextSequence}`;
    }
  });

  const firstReference = await gateway.mountPaymentElement({
    publishableKey: "pk_test_one",
    clientSecret: "seti_secret_one",
    containerSelector: "#payment-one",
    mode: "test"
  });
  const secondReference = await gateway.mountPaymentElement({
    publishableKey: "pk_test_two",
    clientSecret: "seti_secret_two",
    containerSelector: "#payment-two",
    mode: "test"
  });

  const second = await gateway.confirmSetup({
    contextReference: secondReference,
    returnUrl: "https://readyherox.web.app/return"
  });
  const first = await gateway.confirmSetup({
    contextReference: firstReference,
    returnUrl: "https://readyherox.web.app/return"
  });

  assert.equal(second.id, "seti_two");
  assert.equal(first.id, "seti_one");
  assert.deepEqual(confirmations, [
    {suffix: "two", clientSecret: "seti_secret_two"},
    {suffix: "one", clientSecret: "seti_secret_one"}
  ]);
});

test("browser Stripe gateway retrieves a redirected SetupIntent", async () => {
  const calls = [];
  const gateway = new BrowserStripeSetupGateway({
    stripeFactory(publishableKey) {
      calls.push(["stripe", publishableKey]);
      return {
        async retrieveSetupIntent(clientSecret) {
          calls.push(["retrieve", clientSecret]);
          return {
            setupIntent: {
              id: "seti_redirected",
              status: "succeeded",
              payment_method: "pm_redirected"
            }
          };
        }
      };
    }
  });

  const setupIntent = await gateway.retrieveSetupIntent({
    publishableKey: "pk_test_redirect",
    clientSecret: "seti_secret_redirect"
  });

  assert.equal(setupIntent.id, "seti_redirected");
  assert.deepEqual(calls, [
    ["stripe", "pk_test_redirect"],
    ["retrieve", "seti_secret_redirect"]
  ]);
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
                      : functionName === "createStripeSubscription"
                        ? {
                            subscriptionReference: "sub_gateway",
                            status: "active",
                            paymentClientSecret: null
                          }
                        : functionName === "getStripeClientConfig"
                          ? {
                            provider: "stripe",
                            mode: "test",
                            publishableKey: "pk_test_gateway"
                          }
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
    await gateway.createCustomer("client-gateway", "gateway@example.com"),
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
  assert.deepEqual(
    await gateway.createSubscription({
      customerReference: "cus_gateway",
      paymentMethodReference: "pm_gateway",
      country: "Malaysia",
      planId: "plan-monthly",
      idempotencyReference: "attempt-gateway"
    }),
    {
      subscriptionReference: "sub_gateway",
      status: "active",
      paymentClientSecret: null
    }
  );
  assert.deepEqual(
    await gateway.getClientConfig(),
    {
      provider: "stripe",
      mode: "test",
      publishableKey: "pk_test_gateway"
    }
  );
  assert.deepEqual(calls, [
    {
      functionName: "createPaymentCustomer",
      data: {
        inputReference: "client-gateway",
        email: "gateway@example.com"
      }
    },
    {
      functionName: "deleteCustomer",
      data: {customerReference: "cus_gateway"}
    },
    {
      functionName: "createStripeSetupIntent",
      data: {customerReference: "cus_gateway"}
    },
    {
      functionName: "createStripeSubscription",
      data: {
        customerReference: "cus_gateway",
        paymentMethodReference: "pm_gateway",
        country: "Malaysia",
        planId: "plan-monthly",
        idempotencyReference: "attempt-gateway"
      }
    },
    {
      functionName: "getStripeClientConfig",
      data: {}
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
  assert.match(pageHtml, /id="customer-email"/);
  assert.match(pageHtml, /id="setup-intent-form"/);
  assert.match(pageHtml, /id="setup-intent-client-secret"/);
  assert.match(pageHtml, /https:\/\/js\.stripe\.com\/v3\//);
  assert.match(pageHtml, /id="mount-payment-element-form"/);
  assert.match(pageHtml, /id="stripe-setup-payment-element"/);
  assert.match(pageHtml, /id="setup-context-reference"/);
  assert.match(pageHtml, /id="confirm-setup-form"/);
  assert.match(pageHtml, /id="confirm-context-reference"/);
  assert.match(pageHtml, /id="confirmed-payment-method-reference"/);
  assert.match(pageHtml, /id="create-subscription-form"/);
  assert.match(pageHtml, /id="subscription-customer-reference"/);
  assert.match(pageHtml, /id="subscription-payment-method-reference"/);
  assert.match(pageHtml, /id="subscription-country"/);
  assert.match(pageHtml, /id="subscription-plan-id"/);
  assert.match(pageHtml, /id="subscription-idempotency-reference"/);
  assert.match(pageHtml, /id="created-subscription-reference"/);
  assert.match(pageHtml, /id="subscription-payment-client-secret"/);
  assert.match(pageHtml, /id="delete-customer-form"/);
  assert.match(pageHtml, /id="payment-mode"/);
  assert.match(pageScript, /getPaymentConfig/);
  assert.match(pageScript, /getCurrentFirebaseAuthUser/);
  assert.match(
    pageScript,
    /customerEmailEl\.value = currentUser\.email/
  );
  assert.match(pageScript, /createStripeSetupIntent/);
  assert.match(pageScript, /mountSetupPaymentElement/);
  assert.match(pageScript, /confirmSetup/);
  assert.match(pageScript, /createStripeSubscription/);
  assert.match(
    pageScript,
    /createdSubscriptionReference\.textContent\s*=\s*result\.subscriptionReference/
  );
  assert.match(pageScript, /crypto\?\.randomUUID/);
  assert.doesNotMatch(pageScript, /retrieveSetupIntent/);
  assert.match(pageScript, /clientSecret: mountClientSecretEl\.value/);
  assert.match(pageScript, /containerSelector: containerSelectorEl\.value/);
  assert.match(
    pageScript,
    /contextReference: confirmContextReferenceEl\.value/
  );
  assert.match(pageScript, /returnUrl: confirmReturnUrlEl\.value/);
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
