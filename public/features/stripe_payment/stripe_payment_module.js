/**
 * Public APIs:
 *
 * createPaymentCustomer(inputReference, email)
 *   -> Promise<string> Stripe customer reference
 * deleteCustomer(customerReference)
 *   -> Promise<string> deleted Stripe customer reference
 * createStripeSetupIntent(customerReference)
 *   -> Promise<string> Stripe SetupIntent client secret
 * createStripeSubscription({customerReference, paymentMethodReference,
 *   country, planId, idempotencyReference})
 *   -> Promise<{subscriptionReference, status, paymentClientSecret}>
 * getStripeSubscriptionPaymentAction(subscriptionReference)
 *   -> Promise<{action, subscriptionReference, invoiceReference,
 *      paymentStatus, paymentClientSecret, amountDue, currency}>
 * getStripeClientConfig()
 *   -> Promise<{provider: "stripe", mode: "test"|"prod", publishableKey}>
 * mountSetupPaymentElement({clientSecret, containerSelector})
 *   -> Promise<{contextReference: string, mode: "test"|"prod"}>
 * confirmSetup({contextReference, returnUrl})
 *   -> Promise<{setupIntentReference, status, paymentMethodReference}>
 * confirmSubscriptionPayment({paymentClientSecret, returnUrl})
 *   -> Promise<{paymentStatus}>
 * retrieveSetupIntent({clientSecret})
 *   -> Promise<{setupIntentReference, status, paymentMethodReference}>
 */
import {
  CreatePaymentCustomer
} from "./application/create_payment_customer.js?v=20260906-stripe-customer-email-v1";
import {
  DeletePaymentCustomer
} from "./application/delete_payment_customer.js?v=20260903-stripe-customer-test-v1";
import {
  CreateStripeSetupIntent
} from "./application/create_setup_intent.js?v=20260904-stripe-setup-intent-v1";
import {
  CreateStripeSubscription
} from "./application/create_subscription.js?v=20260911-stripe-subscription-v1";
import {
  GetStripeClientConfig
} from "./application/get_stripe_client_config.js?v=20260906-stripe-client-config-v1";
import {
  GetStripeSubscriptionPaymentAction
} from "./application/get_subscription_payment_action.js?v=20260914-complete-payment-v1";
import {
  MountStripeSetupPaymentElement
} from "./application/mount_setup_payment_element.js?v=20260907-stripe-setup-context-v1";
import {
  ConfirmStripeSetup
} from "./application/confirm_setup.js?v=20260907-stripe-setup-context-v1";
import {
  ConfirmStripeSubscriptionPayment
} from "./application/confirm_subscription_payment.js?v=20260912-stripe-subscription-confirm-v1";
import {
  RetrieveStripeSetupIntent
} from "./application/retrieve_setup_intent.js?v=20260906-confirm-setup-redirect-v1";
import {
  BrowserStripeSetupGateway
} from "./infrastructure/browser_stripe_setup_gateway.js?v=20260907-stripe-setup-context-v1";
import {
  BrowserStripePaymentConfirmationGateway
} from "./infrastructure/browser_stripe_payment_confirmation_gateway.js?v=20260912-stripe-subscription-confirm-v1";
import {
  FirebaseCallableStripePaymentGateway
} from "./infrastructure/firebase_callable_stripe_payment_gateway.js?v=20260914-complete-payment-v1";

const stripePaymentGateway = new FirebaseCallableStripePaymentGateway();
const createPaymentCustomerUseCase = new CreatePaymentCustomer(
  stripePaymentGateway
);
const deletePaymentCustomerUseCase = new DeletePaymentCustomer(
  stripePaymentGateway
);
const createStripeSetupIntentUseCase = new CreateStripeSetupIntent(
  stripePaymentGateway
);
const createStripeSubscriptionUseCase = new CreateStripeSubscription(
  stripePaymentGateway
);
const getStripeClientConfigUseCase = new GetStripeClientConfig(
  stripePaymentGateway
);
const getStripeSubscriptionPaymentActionUseCase =
  new GetStripeSubscriptionPaymentAction(stripePaymentGateway);
const browserStripeSetupGateway = new BrowserStripeSetupGateway();
const mountStripeSetupPaymentElementUseCase =
  new MountStripeSetupPaymentElement({
    getStripeClientConfig: () => getStripeClientConfigUseCase.execute(),
    stripeSetupGateway: browserStripeSetupGateway
  });
const confirmStripeSetupUseCase = new ConfirmStripeSetup(
  browserStripeSetupGateway
);
const browserStripePaymentConfirmationGateway =
  new BrowserStripePaymentConfirmationGateway();
const confirmStripeSubscriptionPaymentUseCase =
  new ConfirmStripeSubscriptionPayment({
    getStripeClientConfig: () => getStripeClientConfigUseCase.execute(),
    stripePaymentConfirmationGateway:
      browserStripePaymentConfirmationGateway
  });
const retrieveStripeSetupIntentUseCase =
  new RetrieveStripeSetupIntent({
    getStripeClientConfig: () => getStripeClientConfigUseCase.execute(),
    stripeSetupGateway: browserStripeSetupGateway
  });

async function createPaymentCustomer(inputReference, email) {
  return createPaymentCustomerUseCase.execute(inputReference, email);
}

async function deleteCustomer(customerReference) {
  return deletePaymentCustomerUseCase.execute(customerReference);
}

async function createStripeSetupIntent(customerReference) {
  return createStripeSetupIntentUseCase.execute(customerReference);
}

async function createStripeSubscription(input) {
  return createStripeSubscriptionUseCase.execute(input);
}

async function getStripeClientConfig() {
  return getStripeClientConfigUseCase.execute();
}

async function getStripeSubscriptionPaymentAction(
  subscriptionReference
) {
  return getStripeSubscriptionPaymentActionUseCase.execute(
    subscriptionReference
  );
}

async function mountSetupPaymentElement(input) {
  return mountStripeSetupPaymentElementUseCase.execute(input);
}

async function confirmSetup(input) {
  return confirmStripeSetupUseCase.execute(input);
}

async function confirmSubscriptionPayment(input) {
  return confirmStripeSubscriptionPaymentUseCase.execute(input);
}

async function retrieveSetupIntent(input) {
  return retrieveStripeSetupIntentUseCase.execute(input);
}

export {
  confirmSetup,
  confirmSubscriptionPayment,
  createStripeSetupIntent,
  createStripeSubscription,
  createPaymentCustomer,
  deleteCustomer,
  getStripeClientConfig,
  getStripeSubscriptionPaymentAction,
  mountSetupPaymentElement,
  retrieveSetupIntent
};
