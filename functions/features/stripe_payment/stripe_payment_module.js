/**
 * Internal feature API:
 *
 * createStripePayment({mode}) -> StripePayment
 * getStripePublishableKey({mode}) -> string
 * stripeTestWebhookSecret -> Firebase SecretParam
 * stripeTestWebhookSecrets -> Firebase SecretParam[] for the test webhook
 * stripeProdWebhookSecret -> Firebase SecretParam
 * stripeProdWebhookSecrets -> Firebase SecretParam[] for the production webhook
 * StripePayment.createCustomer(inputReference, email)
 *   -> Promise<string> Stripe customer reference
 * StripePayment.customerExists(customerReference) -> Promise<boolean>
 * StripePayment.deleteCustomer(customerReference)
 *   -> Promise<string> deleted Stripe customer reference
 * StripePayment.createSetupIntent(customerReference)
 *   -> Promise<{setupIntentReference, clientSecret, status, usage,
 *      paymentMethodReference}>
 * StripePayment.constructWebhookEvent({payload, signature, webhookSecret})
 *   -> Stripe.Event
 * StripePayment.retrievePaymentMethod(paymentMethodReference)
 *   -> Promise<{paymentMethodReference, customerReference, type, card}>
 * StripePayment.createSubscription({customerReference,
 *   paymentMethodReference, stripeProductName, amount, currency, interval,
 *   intervalCount, idempotencyReference})
 *   -> Promise<{subscriptionReference, status, paymentClientSecret}>
 *   amount is an integer in the currency's smallest unit.
 * StripePayment.retrieveSubscription(subscriptionReference)
 *   -> Promise<{subscriptionReference, customerReference, status,
 *      subscriptionStartDate, currentPeriodStart, currentPeriodEnd,
 *      cancelAtPeriodEnd}>
 * StripePayment.retrieveInvoicePaymentContext(invoiceReference)
 *   -> Promise<{invoiceReference, customerReference, subscriptionReference,
 *      invoiceStatus, paymentIntentReference, paymentStatus,
 *      paymentClientSecret, amountDue, currency}>
 */
const {
  StripePaymentFactory,
} = require("./infrastructure/stripe_payment_factory");
const {
  StripePublishableKeyProvider,
} = require("./infrastructure/stripe_publishable_key_provider");
const {
  stripePublishableKeys,
  stripeProdWebhookSecret,
  stripeProdWebhookSecrets,
  stripeSecretKeys,
  stripeTestWebhookSecret,
  stripeTestWebhookSecrets,
} = require("./infrastructure/stripe_secrets");

const stripePaymentFactory = new StripePaymentFactory();
const stripePublishableKeyProvider = new StripePublishableKeyProvider();

function createStripePayment({ mode }) {
  return stripePaymentFactory.create({ mode });
}

function getStripePublishableKey({mode}) {
  return stripePublishableKeyProvider.getPublishableKey(mode);
}

module.exports = {
  createStripePayment,
  getStripePublishableKey,
  stripePublishableKeys,
  stripeProdWebhookSecret,
  stripeProdWebhookSecrets,
  stripeSecretKeys,
  stripeTestWebhookSecret,
  stripeTestWebhookSecrets,
};
