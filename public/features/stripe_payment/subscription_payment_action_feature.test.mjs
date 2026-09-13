import assert from "node:assert/strict";
import test from "node:test";

import {
  GetStripeSubscriptionPaymentAction
} from "./application/get_subscription_payment_action.js?v=20260914-complete-payment-v1";
import {
  FirebaseCallableStripePaymentGateway
} from "./infrastructure/firebase_callable_stripe_payment_gateway.js?v=20260914-complete-payment-v1";
import {
  getStripeSubscriptionPaymentAction
} from "./stripe_payment_module.js?v=20260914-complete-payment-v1";

test("Stripe payment module exposes subscription payment actions", () => {
  assert.equal(
    typeof getStripeSubscriptionPaymentAction,
    "function"
  );
});

test("payment-action use case validates and normalizes confirmation data", async () => {
  const calls = [];
  const useCase = new GetStripeSubscriptionPaymentAction({
    async getSubscriptionPaymentAction(subscriptionReference) {
      calls.push(subscriptionReference);
      return {
        action: "confirm_payment",
        subscriptionReference: "sub_customer",
        invoiceReference: "in_customer",
        paymentStatus: "requires_action",
        paymentClientSecret: "pi_customer_secret_123",
        amountDue: 4500,
        currency: "MYR"
      };
    }
  });

  const result = await useCase.execute(" sub_customer ");

  assert.deepEqual(calls, ["sub_customer"]);
  assert.deepEqual(result, {
    action: "confirm_payment",
    subscriptionReference: "sub_customer",
    invoiceReference: "in_customer",
    paymentStatus: "requires_action",
    paymentClientSecret: "pi_customer_secret_123",
    amountDue: 4500,
    currency: "myr"
  });
  assert.equal(Object.isFrozen(result), true);
});

test("payment-action use case removes secrets from non-confirm actions", async () => {
  const useCase = new GetStripeSubscriptionPaymentAction({
    async getSubscriptionPaymentAction() {
      return {
        action: "wait",
        subscriptionReference: "sub_wait",
        invoiceReference: "in_wait",
        paymentStatus: "processing",
        paymentClientSecret: "pi_secret_must_not_escape",
        amountDue: 4500,
        currency: "myr"
      };
    }
  });

  const result = await useCase.execute("sub_wait");

  assert.equal(result.action, "wait");
  assert.equal(result.paymentClientSecret, null);
});

test("payment-action use case rejects a mismatched subscription", async () => {
  const useCase = new GetStripeSubscriptionPaymentAction({
    async getSubscriptionPaymentAction() {
      return {
        action: "complete",
        subscriptionReference: "sub_other",
        invoiceReference: "in_other",
        paymentStatus: "succeeded",
        amountDue: 4500,
        currency: "myr"
      };
    }
  });

  await assert.rejects(
    () => useCase.execute("sub_expected"),
    /unexpected subscription reference/
  );
});

test("Firebase gateway calls the subscription payment-action function", async () => {
  const calls = [];
  const expected = {
    action: "complete",
    subscriptionReference: "sub_gateway",
    invoiceReference: "in_gateway",
    paymentStatus: "succeeded",
    paymentClientSecret: null,
    amountDue: 4500,
    currency: "myr"
  };
  const gateway = new FirebaseCallableStripePaymentGateway({
    getApp() {
      return {
        functions(region) {
          assert.equal(region, "us-central1");

          return {
            httpsCallable(functionName) {
              return async (data) => {
                calls.push({functionName, data});
                return {data: expected};
              };
            }
          };
        }
      };
    }
  });

  assert.deepEqual(
    await gateway.getSubscriptionPaymentAction("sub_gateway"),
    expected
  );
  assert.deepEqual(calls, [{
    functionName: "getStripeSubscriptionPaymentAction",
    data: {subscriptionReference: "sub_gateway"}
  }]);
});
