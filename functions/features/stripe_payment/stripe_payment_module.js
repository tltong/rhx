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
 *   Optional {metadata, idempotencyReference} scopes card-only setup to a
 *   subscription. Default customer-only setup behavior remains compatible.
 * StripePayment.retrieveSetupIntent(setupIntentReference)
 *   -> Promise<{setupIntentReference, customerReference, status, usage,
 *      paymentMethodReference, metadata, createdAt}> (no client secret)
 * StripePayment.updateSubscriptionPaymentMethod({subscriptionReference,
 *   paymentMethodReference, setupIntentReference}) -> Promise<{subscriptionReference}>
 *   Updates only that subscription's default card and automatic card-saving flag.
 * StripePayment.constructWebhookEvent({payload, signature, webhookSecret})
 *   -> Stripe.Event
 * StripePayment.retrievePaymentMethod(paymentMethodReference)
 *   -> Promise<{paymentMethodReference, customerReference, type, card}>
 * StripePayment.createSubscription({customerReference,
 *   paymentMethodReference, stripeProductName, amount, currency, interval,
 *   intervalCount, idempotencyReference})
 *   -> Promise<{subscriptionReference, status, paymentClientSecret}>
 *   amount is an integer in the currency's smallest unit.
 * StripePayment.retrieveSubscription(subscriptionReference,
 *   {includePaymentClientSecret?: boolean, includeRecoveryDetails?: boolean}?)
 *   -> Promise<{subscriptionReference, customerReference, status,
 *      subscriptionStartDate, currentPeriodStart, currentPeriodEnd,
 *      cancelAtPeriodEnd, paymentClientSecret?}>
 *   Payment client secrets are included only when explicitly requested for
 *   checkout responses; webhook processing never persists them.
 * StripePayment.retrieveInvoicePaymentContext(invoiceReference,
 *   {includeRecoveryDetails?: boolean}?)
 *   -> Promise<{invoiceReference, customerReference, subscriptionReference,
 *      invoiceStatus, paymentIntentReference, paymentStatus,
 *      paymentClientSecret, amountDue, currency}>
 *   Recovery details include amountRemaining, collectionMethod,
 *   defaultPaymentMethodReference, billingReason, paymentAttempted and a
 *   failureCode for application mapping.
 * StripePayment.payInvoice({invoiceReference, paymentMethodReference,
 *   idempotencyReference, offSession?}) -> Promise<{invoiceReference, invoiceStatus}>
 *   Calls Stripe invoices.pay on-session; business ownership checks occur in
 *   stripe_payment_subscription before this provider operation is invoked.
 *   offSession defaults to false for guardian retries; scheduler attempts use true.
 * StripePayment.disableInvoiceAutomaticCollection(invoiceReference)
 *   -> Promise<{invoiceReference, autoAdvance: false}> takes per-invoice retry control
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

function createStripePayment({mode, requestTimeoutMs}) {
  return stripePaymentFactory.create({mode, ...(requestTimeoutMs === undefined ? {} : {requestTimeoutMs})});
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
