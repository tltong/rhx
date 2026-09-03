const {
  PAYMENT_CONFIGS_COLLECTION,
  PAYMENT_CONFIG_DOCUMENT_ID,
} = require("../../../schema/payment_config_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  PaymentConfig,
} = require("../domain/payment_config");
const {
  PaymentConfigRepository,
} = require("../domain/payment_config_repository");

class FirestorePaymentConfigRepository extends PaymentConfigRepository {
  constructor({ readDocument = firebaseOps.readDocument } = {}) {
    super();
    this.readDocument = readDocument;
  }

  async get() {
    const data = await this.readDocument(
      PAYMENT_CONFIGS_COLLECTION,
      PAYMENT_CONFIG_DOCUMENT_ID,
    );

    if (!data) {
      return null;
    }

    return new PaymentConfig({
      id: PAYMENT_CONFIG_DOCUMENT_ID,
      provider: data.provider,
      mode: data.mode,
      customData: data.customData,
      updatedAt: data.updatedAt,
    });
  }
}

module.exports = {
  FirestorePaymentConfigRepository,
};
