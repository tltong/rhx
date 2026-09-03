/**
 * Internal feature API:
 *
 * createPaymentProvider() -> Promise<PaymentProvider>
 */
const {
  getPaymentConfig,
} = require("../payment/payment_module");
const {
  createStripePayment,
  stripeSecretKeys,
} = require("../stripe_payment/stripe_payment_module");
const {
  CreatePaymentProvider,
} = require("./application/create_payment_provider");

const createPaymentProviderUseCase = new CreatePaymentProvider({
  getPaymentConfig,
  providerFactories: Object.freeze({
    stripe: createStripePayment,
  }),
});

async function createPaymentProvider() {
  return createPaymentProviderUseCase.execute();
}

const paymentProviderSecrets = stripeSecretKeys;

module.exports = {
  createPaymentProvider,
  paymentProviderSecrets,
};
