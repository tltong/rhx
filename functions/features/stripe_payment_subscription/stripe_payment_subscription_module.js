/**
 * Internal application API:
 *
 * createStripePaymentSubscription({customerReference,
 *   paymentMethodReference, country, planId, idempotencyReference})
 *   -> Promise<{subscriptionReference, status, paymentClientSecret}>
 * getStripeSubscriptionPaymentAction({
 *   internalReference, subscriptionReference})
 *   -> Promise<{action, subscriptionReference, invoiceReference,
 *      paymentStatus, paymentClientSecret, amountDue, currency}>
 * processStripeSubscriptionEvent({
 *   mode: "test"|"prod", event: Stripe.Event})
 *   -> Promise<{handled, eventType, mode?, invoiceReference?,
 *      customerReference?, subscriptionReference?, status?,
 *      subscriptionStartDate?, currentPeriodStart?, currentPeriodEnd?,
 *      cancelAtPeriodEnd?}>
 *
 * This feature resolves trusted plan billing terms, creates the Stripe
 * subscription, synchronizes invoice-driven state, and supplies the
 * customer-owned payment action needed by a complete-payment page.
 */
const {
  createPaymentProviderContext,
} = require("../payment_factory/payment_factory_module");
const {
  createStripePayment,
} = require("../stripe_payment/stripe_payment_module");
const {
  getCustomerRecordByInternalReference,
  getCustomerRecordByReference,
  getSubscriptionRecord,
  writeSubscriptionRecord,
} = require("../stripe_customer/stripe_customer_module");
const {
  getSubscriptionPlanBillingTerms,
} = require("../syllabus_subscription/subscription_plan_module");
const {
  CreateStripePaymentSubscription,
} = require("./application/create_stripe_payment_subscription");
const {
  GetStripeSubscriptionPaymentAction,
} = require("./application/get_stripe_subscription_payment_action");
const {
  ProcessStripeSubscriptionEvent,
} = require("./application/process_stripe_subscription_event");

const createStripePaymentSubscriptionUseCase =
  new CreateStripePaymentSubscription({
    createPaymentProviderContext,
    getCustomerRecordByReference,
    getSubscriptionPlanBillingTerms,
    writeSubscriptionRecord,
  });
const processStripeSubscriptionEventUseCase =
  new ProcessStripeSubscriptionEvent({
    createStripePayment,
    getSubscriptionRecord,
    writeSubscriptionRecord,
  });
const getStripeSubscriptionPaymentActionUseCase =
  new GetStripeSubscriptionPaymentAction({
    createPaymentProviderContext,
    getCustomerRecordByInternalReference,
    getSubscriptionRecord,
  });

async function createStripePaymentSubscription(input) {
  return createStripePaymentSubscriptionUseCase.execute(input);
}

async function processStripeSubscriptionEvent(input) {
  return processStripeSubscriptionEventUseCase.execute(input);
}

async function getStripeSubscriptionPaymentAction(input) {
  return getStripeSubscriptionPaymentActionUseCase.execute(input);
}

module.exports = {
  createStripePaymentSubscription,
  getStripeSubscriptionPaymentAction,
  processStripeSubscriptionEvent,
};
