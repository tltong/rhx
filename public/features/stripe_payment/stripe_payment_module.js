/**
 * Public APIs:
 * Subscription management exports are compatibility aliases. Guardian pages
 * should query stripe_payment_subscription directly.
 *
 * createPaymentCustomer(inputReference, email)
 *   -> Promise<string> Stripe customer reference
 * listStripeCustomers() -> Promise<{mode, customers: {customerReference, email}[]}>
 * deleteCustomer(customerReference)
 *   -> Promise<string> deleted Stripe customer reference
 * createStripeSetupIntent(customerReference)
 *   -> Promise<string> Stripe SetupIntent client secret
 * createStripeSetupIntent({subscriptionReference, idempotencyReference})
 *   -> Promise<{setupIntentReference, clientSecret}> owned future-card setup
 * getStripeSubscriptionPaymentDetails({subscriptionReference, invoiceReference?})
 *   -> Promise<{subscriptionReference, subscriptionStatus, currentCard,
 *      canChangeCard, paymentState, renewal, nextChargeAt, linkedInvoiceIsCurrent}>
 * updateStripeSubscriptionPaymentMethod({subscriptionReference, setupIntentReference})
 *   -> Promise<subscription payment details>; does not pay an invoice
 * createStripeSubscription({studentId, customerReference,
 *   paymentMethodReference, country, planId, idempotencyReference})
 *   -> Promise<{subscriptionReference, status, paymentClientSecret}>
 * getStripeSubscriptionPaymentAction(subscriptionReference |
 *   {subscriptionReference, invoiceReference?, paymentMethodChoice?: "new_card"})
 *   -> Promise<{action, subscriptionReference, invoiceReference,
 *      paymentStatus, paymentClientSecret, amountDue, currency,
 *      canRetry, savedCard, failureCode, invoiceStatus, subscriptionStatus,
 *      billingReason}>
 * retryStripeSubscriptionPayment({subscriptionReference, invoiceReference,
 *   idempotencyReference}) -> Promise<same payment-action DTO>
 *   Retries only the saved card on a failed recurring renewal invoice. Keep the same
 *   idempotencyReference when retrying a request whose outcome is unknown.
 * getStripeClientConfig()
 *   -> Promise<{provider: "stripe", mode: "test"|"prod", publishableKey}>
 * mountSetupPaymentElement({clientSecret, containerSelector})
 *   -> Promise<{contextReference: string, mode: "test"|"prod"}>
 * confirmSetup({contextReference, returnUrl, redirectBehavior?})
 *   -> Promise<{setupIntentReference, status, paymentMethodReference}>
 * confirmSubscriptionPayment({
 *   paymentClientSecret?, contextReference?, returnUrl, redirectBehavior?, authenticationOnly?, useSavedCard?
 * })
 *   -> Promise<{paymentStatus}>
 *   authenticationOnly completes 3DS for a server-confirmed PaymentIntent.
 *   useSavedCard confirms an initial PaymentIntent with its verified attached card.
 *   Both modes require an explicit guardian action; they cannot be combined.
 *   contextReference submits a new card on the existing Invoice PaymentIntent.
 * disposePaymentElement({contextReference}) -> void (cancel/sign-out cleanup)
 * retrieveSetupIntent({clientSecret})
 *   -> Promise<{setupIntentReference, status, paymentMethodReference}>
 */
import {
  CreatePaymentCustomer
} from "./application/create_payment_customer.js?v=20260906-stripe-customer-email-v1";
import {
  ListStripeCustomers
} from "./application/list_stripe_customers.js?v=20261025-customer-select-v1";
import {
  DeletePaymentCustomer
} from "./application/delete_payment_customer.js?v=20260903-stripe-customer-test-v1";
import {
  CreateStripeSetupIntent
} from "./application/create_setup_intent.js?v=20261031-renewal-restart-v1";
import {
  CreateStripeSubscription
} from "./application/create_subscription.js?v=20260917-student-link-v1";
import {
  GetStripeClientConfig
} from "./application/get_stripe_client_config.js?v=20260906-stripe-client-config-v1";
// Compatibility exports for checkout/admin callers. Guardian subscription pages
// import these operations directly from the subscription feature.
import {getStripeSubscriptionPaymentDetails, getStripeSubscriptionPaymentAction,
  retryStripeSubscriptionPayment, updateStripeSubscriptionPaymentMethod,
  createStripeSubscriptionCardSetup}
  from "../stripe_payment_subscription/stripe_payment_subscription_module.js?v=20261101-stored-status-v1";
import {
  MountStripeSetupPaymentElement
} from "./application/mount_setup_payment_element.js?v=20260907-stripe-setup-context-v1";
import {
  ConfirmStripeSetup
} from "./application/confirm_setup.js?v=20260919-redirect-toggle-v1";
import {
  ConfirmStripeSubscriptionPayment
} from "./application/confirm_subscription_payment.js?v=20261031-initial-confirm-v1";
import {
  RetrieveStripeSetupIntent
} from "./application/retrieve_setup_intent.js?v=20260906-confirm-setup-redirect-v1";
import {
  BrowserStripeSetupGateway
} from "./infrastructure/browser_stripe_setup_gateway.js?v=20261028-manage-payments-v1";
import {
  BrowserStripePaymentConfirmationGateway
} from "./infrastructure/browser_stripe_payment_confirmation_gateway.js?v=20261031-initial-confirm-v1";
import {
  FirebaseCallableStripePaymentGateway
} from "./infrastructure/firebase_callable_stripe_payment_gateway.js?v=20261028-subscription-feature-v1";

const stripePaymentGateway = new FirebaseCallableStripePaymentGateway();
const createPaymentCustomerUseCase = new CreatePaymentCustomer(
  stripePaymentGateway
);
const listStripeCustomersUseCase = new ListStripeCustomers(stripePaymentGateway);
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
      browserStripePaymentConfirmationGateway,
    stripeSetupGateway: browserStripeSetupGateway
  });
const retrieveStripeSetupIntentUseCase =
  new RetrieveStripeSetupIntent({
    getStripeClientConfig: () => getStripeClientConfigUseCase.execute(),
    stripeSetupGateway: browserStripeSetupGateway
  });

async function createPaymentCustomer(inputReference, email) {
  return createPaymentCustomerUseCase.execute(inputReference, email);
}

async function listStripeCustomers() {
  return listStripeCustomersUseCase.execute();
}

async function deleteCustomer(customerReference) {
  return deletePaymentCustomerUseCase.execute(customerReference);
}

async function createStripeSetupIntent(customerReference) {
  if (customerReference && typeof customerReference === "object") {
    return createStripeSubscriptionCardSetup(customerReference);
  }
  return createStripeSetupIntentUseCase.execute(customerReference);
}

async function createStripeSubscription(input) {
  return createStripeSubscriptionUseCase.execute(input);
}

async function getStripeClientConfig() {
  return getStripeClientConfigUseCase.execute();
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
  getStripeSubscriptionPaymentDetails,
  listStripeCustomers,
  mountSetupPaymentElement,
  retrieveSetupIntent,
  retryStripeSubscriptionPayment,
  updateStripeSubscriptionPaymentMethod
};

export function disposePaymentElement(input) {
  browserStripeSetupGateway.disposePaymentElement(input);
}
