/**
 * Internal API:
 *
 * getPaymentConfig()
 *   -> Promise<PaymentConfig|null>
 */
const {
  GetPaymentConfig,
} = require("./application/get_payment_config");
const {
  paymentModes,
  paymentProviders,
} = require("./domain/payment_config");
const {
  FirestorePaymentConfigRepository,
} = require("./infrastructure/firestore_payment_config_repository");

const paymentConfigRepository = new FirestorePaymentConfigRepository();
const getPaymentConfigUseCase = new GetPaymentConfig(
  paymentConfigRepository,
);

async function getPaymentConfig() {
  return getPaymentConfigUseCase.execute();
}

module.exports = {
  getPaymentConfig,
  paymentModes,
  paymentProviders,
};
