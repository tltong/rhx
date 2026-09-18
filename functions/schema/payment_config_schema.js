const PAYMENT_CONFIGS_COLLECTION = "paymentConfigs";
const PAYMENT_CONFIG_DOCUMENT_ID = "default";

const paymentProviders = Object.freeze({
  STRIPE: "stripe",
});

const paymentModes = Object.freeze({
  TEST: "test",
  PROD: "prod",
});


const paymentConfigSchema = {
  collection: PAYMENT_CONFIGS_COLLECTION,
  documentId: PAYMENT_CONFIG_DOCUMENT_ID,
  fields: {
    provider: {
      type: "string",
      enum: Object.values(paymentProviders),
    },
    mode: {
      type: "string",
      enum: Object.values(paymentModes),
    },
    customData: "map",
    updatedAt: "timestamp",
  },
};

module.exports = {
  PAYMENT_CONFIGS_COLLECTION,
  PAYMENT_CONFIG_DOCUMENT_ID,
  paymentProviders,
  paymentModes,
  paymentConfigSchema,
};
