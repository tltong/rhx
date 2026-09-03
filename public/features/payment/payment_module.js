/**
 * Public APIs:
 *
 * getPaymentConfig()
 *   -> Promise<PaymentConfig|null>
 * savePaymentConfig({provider, mode, customData})
 *   -> Promise<PaymentConfig>
 */
import {
  GetPaymentConfig
} from "./application/get_payment_config.js?v=20260901-payment-config-simple-v1";
import {
  SavePaymentConfig
} from "./application/save_payment_config.js?v=20260901-payment-config-simple-v1";
import {
  paymentModes
} from "./domain/payment_config.js?v=20260901-payment-config-simple-v1";
import {
  FirestorePaymentConfigRepository
} from "./infrastructure/firestore_payment_config_repository.js?v=20260901-payment-config-simple-v1";

const paymentConfigRepository = new FirestorePaymentConfigRepository();
const getPaymentConfigUseCase = new GetPaymentConfig(
  paymentConfigRepository
);
const savePaymentConfigUseCase = new SavePaymentConfig(
  paymentConfigRepository
);

async function getPaymentConfig() {
  return getPaymentConfigUseCase.execute();
}

async function savePaymentConfig(input) {
  return savePaymentConfigUseCase.execute(input);
}

export {
  getPaymentConfig,
  paymentModes,
  savePaymentConfig
};
