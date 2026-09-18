/**
 * Internal feature API:
 *
 * createPaymentProvider() -> Promise<PaymentProvider>
 * createPaymentProviderContext()
 *   -> Promise<{providerName: string, mode: string, paymentProvider}>
 */
const {
  getPaymentConfig,
  paymentProviders,
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
    [paymentProviders.STRIPE]: createStripePayment,
  }),
});

async function createPaymentProvider() {
  return createPaymentProviderUseCase.execute();
}

async function createPaymentProviderContext() {
  return createPaymentProviderUseCase.executeWithContext();
}

const paymentProviderSecrets = stripeSecretKeys;

module.exports = {
  createPaymentProvider,
  createPaymentProviderContext,
  paymentProviderSecrets,
};
