import assert from "node:assert/strict";
import {test} from "node:test";
import {RetryStripeSubscriptionPayment}
  from "../stripe_payment_subscription/application/retry_subscription_payment.js";
import {GetStripeSubscriptionPaymentAction}
  from "../stripe_payment_subscription/application/get_subscription_payment_action.js";
import {FirebaseCallableStripePaymentGateway} from "./infrastructure/firebase_callable_stripe_payment_gateway.js";
import {BrowserStripePaymentConfirmationGateway} from "./infrastructure/browser_stripe_payment_confirmation_gateway.js";
import {ConfirmStripeSubscriptionPayment} from "./application/confirm_subscription_payment.js";
import {retryStripeSubscriptionPayment} from "./stripe_payment_module.js";

const input = {subscriptionReference: "sub_owner", invoiceReference: "in_due", idempotencyReference: "attempt"};
const result = {action: "retry_payment", ...input, amountDue: 2500, currency: "MYR", canRetry: true,
  savedCard: {brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030},
  paymentStatus: "requires_payment_method", paymentClientSecret: "secret_must_not_escape"};

test("Web retry validates input and forwards only subscription, invoice, and attempt", async () => {
  assert.equal(typeof retryStripeSubscriptionPayment, "function");
  let received;
  const useCase = new RetryStripeSubscriptionPayment({async retrySubscriptionPayment(value) {
    received = value; return result;
  }});
  const actual = await useCase.execute({...input, customerReference: "cus_forged", amount: 1});
  assert.deepEqual(received, input);
  assert.equal(actual.action, "retry_payment");
  assert.equal(actual.currency, "myr");
  assert.equal(actual.paymentClientSecret, null);
  for (const patch of [{invoiceReference: "bad"}, {subscriptionReference: "bad"},
    {idempotencyReference: ""}, {idempotencyReference: "x".repeat(501)}]) {
    await assert.rejects(() => useCase.execute({...input, ...patch}));
  }
});

test("Web retry refuses a mismatched invoice or subscription response", async () => {
  for (const changes of [{invoiceReference: "in_wrong"}, {subscriptionReference: "sub_wrong"}]) {
    const useCase = new RetryStripeSubscriptionPayment({async retrySubscriptionPayment() {
      return {...result, ...changes};
    }});
    await assert.rejects(() => useCase.execute(input), /unexpected/);
  }
});

test("extended payment-action lookup pins invoice and normalizes masked card", async () => {
  let received;
  const useCase = new GetStripeSubscriptionPaymentAction({async getSubscriptionPaymentAction(value) {
    received = value; return {...result, savedCard: {...result.savedCard, customerReference: "private"}};
  }});
  const actual = await useCase.execute(input);
  assert.deepEqual(received, {subscriptionReference: "sub_owner", invoiceReference: "in_due"});
  assert.deepEqual(actual.savedCard, result.savedCard);
});

test("Firebase gateway sends retry to authenticated callable with extended timeout", async () => {
  const calls = [];
  const gateway = new FirebaseCallableStripePaymentGateway({getApp: () => ({functions: () => ({
    httpsCallable(name, options) {return async data => {calls.push({name, options, data}); return {data: result};};}
  })})});
  await gateway.retrySubscriptionPayment(input);
  assert.deepEqual(calls, [{name: "retryStripeSubscriptionPayment", options: {timeout: 120000}, data: input}]);
  await gateway.getSubscriptionPaymentAction({subscriptionReference: "sub_owner", invoiceReference: "in_due"});
  assert.deepEqual(calls[1].data, {subscriptionReference: "sub_owner", invoiceReference: "in_due"});
});

test("existing confirmation API handles a server-confirmed 3DS next action without another confirmation", async () => {
  const calls = [];
  const gateway = new BrowserStripePaymentConfirmationGateway({stripeFactory: () => ({
    async handleNextAction(options) {calls.push(options); return {paymentIntent: {status: "succeeded"}};},
    async confirmPayment() {throw Error("Must not re-confirm an already confirmed invoice PaymentIntent");}
  })});
  const useCase = new ConfirmStripeSubscriptionPayment({
    getStripeClientConfig: async () => ({publishableKey: "pk_test"}),
    stripePaymentConfirmationGateway: gateway
  });
  assert.deepEqual(await useCase.execute({paymentClientSecret: "pi_owner_secret_123",
    returnUrl: "https://readyherox.web.app/payment", authenticationOnly: true}), {paymentStatus: "succeeded"});
  assert.deepEqual(calls, [{clientSecret: "pi_owner_secret_123"}]);
});
