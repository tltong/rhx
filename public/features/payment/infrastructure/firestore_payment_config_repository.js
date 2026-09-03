import {
  PAYMENT_CONFIGS_COLLECTION,
  PAYMENT_CONFIG_DOCUMENT_ID
} from "../../../config/firebase/payment_config_schema.js?v=20260901-payment-config-simple-v1";
import {
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  PaymentConfig
} from "../domain/payment_config.js?v=20260901-payment-config-simple-v1";
import {
  PaymentConfigRepository
} from "../domain/payment_config_repository.js";

function toPaymentConfig(data) {
  if (!data) {
    return null;
  }

  return new PaymentConfig({
    id: PAYMENT_CONFIG_DOCUMENT_ID,
    provider: data.provider,
    mode: data.mode,
    customData: data.customData,
    updatedAt: data.updatedAt
  });
}

function toPaymentConfigRecord(paymentConfig) {
  return {
    provider: paymentConfig.provider,
    mode: paymentConfig.mode,
    customData: paymentConfig.customData,
    updatedAt: paymentConfig.updatedAt
  };
}

export class FirestorePaymentConfigRepository
  extends PaymentConfigRepository {
  async get() {
    const data = await readDocument(
      PAYMENT_CONFIGS_COLLECTION,
      PAYMENT_CONFIG_DOCUMENT_ID
    );

    return toPaymentConfig(data);
  }

  async save(paymentConfig) {
    await writeDocument(
      PAYMENT_CONFIGS_COLLECTION,
      PAYMENT_CONFIG_DOCUMENT_ID,
      toPaymentConfigRecord(paymentConfig),
      { merge: false }
    );

    return paymentConfig;
  }
}
