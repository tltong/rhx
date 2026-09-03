/**
 * Internal feature API:
 *
 * createStripePayment({mode}) -> StripePayment
 * StripePayment.createCustomer(inputReference)
 *   -> Promise<string> Stripe customer reference
 * StripePayment.deleteCustomer(customerReference)
 *   -> Promise<string> deleted Stripe customer reference
 * StripePayment.createSetupIntent(customerReference)
 *   -> Promise<string> Stripe SetupIntent client secret
 */
const {
  StripePaymentFactory,
} = require("./infrastructure/stripe_payment_factory");
const {
  stripeSecretKeys,
} = require("./infrastructure/stripe_secrets");

const stripePaymentFactory = new StripePaymentFactory();

function createStripePayment({ mode }) {
  return stripePaymentFactory.create({ mode });
}

module.exports = {
  createStripePayment,
  stripeSecretKeys,
};
