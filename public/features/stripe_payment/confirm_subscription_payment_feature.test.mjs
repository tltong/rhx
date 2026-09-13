import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfirmStripeSubscriptionPayment
} from "./application/confirm_subscription_payment.js?v=20260912-stripe-subscription-confirm-v1";
import {
  BrowserStripePaymentConfirmationGateway
} from "./infrastructure/browser_stripe_payment_confirmation_gateway.js?v=20260912-stripe-subscription-confirm-v1";
import {
  confirmSubscriptionPayment
} from "./stripe_payment_module.js?v=20260912-stripe-subscription-confirm-v1";

test("Stripe payment module exposes subscription payment confirmation", () => {
  assert.equal(typeof confirmSubscriptionPayment, "function");
});

test("confirm subscription payment returns only paymentStatus", async () => {
  const calls = [];
  const useCase = new ConfirmStripeSubscriptionPayment({
    async getStripeClientConfig() {
      calls.push(["config"]);
      return {
        mode: "test",
        publishableKey: "pk_test_payment"
      };
    },
    stripePaymentConfirmationGateway: {
      async confirmPayment(input) {
        calls.push(["confirm", input]);
        return {
          id: "pi_confirmed",
          status: "succeeded",
          payment_method: "pm_confirmed"
        };
      }
    }
  });

  const result = await useCase.execute({
    paymentClientSecret: " pi_secret_confirmed ",
    returnUrl: "https://readyherox.web.app/payment-complete"
  });

  assert.deepEqual(result, {paymentStatus: "succeeded"});
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [
    ["config"],
    ["confirm", {
      publishableKey: "pk_test_payment",
      clientSecret: "pi_secret_confirmed",
      returnUrl: "https://readyherox.web.app/payment-complete"
    }]
  ]);
});

test("confirm subscription payment rejects an invalid Stripe result", async () => {
  const useCase = new ConfirmStripeSubscriptionPayment({
    async getStripeClientConfig() {
      return {publishableKey: "pk_test_payment"};
    },
    stripePaymentConfirmationGateway: {
      async confirmPayment() {
        return null;
      }
    }
  });

  await assert.rejects(
    () => useCase.execute({
      paymentClientSecret: "pi_secret_invalid",
      returnUrl: "https://readyherox.web.app/payment-complete"
    }),
    /did not return the confirmed PaymentIntent/
  );
});

test("browser Stripe gateway confirms a subscription payment", async () => {
  const calls = [];
  const gateway = new BrowserStripePaymentConfirmationGateway({
    stripeFactory(publishableKey) {
      calls.push(["stripe", publishableKey]);
      return {
        async confirmPayment(options) {
          calls.push(["confirmPayment", options]);
          return {
            paymentIntent: {
              id: "pi_browser",
              status: "processing"
            }
          };
        }
      };
    }
  });

  const paymentIntent = await gateway.confirmPayment({
    publishableKey: "pk_test_browser",
    clientSecret: "pi_secret_browser",
    returnUrl: "https://readyherox.web.app/payment-complete"
  });

  assert.equal(paymentIntent.id, "pi_browser");
  assert.deepEqual(calls, [
    ["stripe", "pk_test_browser"],
    ["confirmPayment", {
      clientSecret: "pi_secret_browser",
      confirmParams: {
        return_url: "https://readyherox.web.app/payment-complete"
      },
      redirect: "if_required"
    }]
  ]);
});

test("browser Stripe gateway preserves safe Stripe error details", async () => {
  const gateway = new BrowserStripePaymentConfirmationGateway({
    stripeFactory() {
      return {
        async confirmPayment() {
          return {
            error: {
              message: "Your card was declined.",
              code: "card_declined",
              type: "card_error"
            }
          };
        }
      };
    }
  });

  await assert.rejects(
    () => gateway.confirmPayment({
      publishableKey: "pk_test_browser",
      clientSecret: "pi_secret_browser",
      returnUrl: "https://readyherox.web.app/payment-complete"
    }),
    (error) => {
      assert.equal(error.message, "Your card was declined.");
      assert.equal(error.code, "card_declined");
      assert.equal(error.type, "card_error");
      return true;
    }
  );
});
