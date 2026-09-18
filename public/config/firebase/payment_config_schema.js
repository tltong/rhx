export const PAYMENT_CONFIGS_COLLECTION = "paymentConfigs";
export const PAYMENT_CONFIG_DOCUMENT_ID = "default";

export const paymentProviders = Object.freeze({
  STRIPE: "stripe"
});

export const paymentModes = Object.freeze({
  TEST: "test",
  PROD: "prod"
});


export const paymentConfigSchema = {
  collection: PAYMENT_CONFIGS_COLLECTION,
  documentId: PAYMENT_CONFIG_DOCUMENT_ID,
  fields: {
    provider: {
      type: "string",
      enum: Object.values(paymentProviders)
    },
    mode: {
      type: "string",
      enum: Object.values(paymentModes)
    },
    customData: "map",
    updatedAt: "timestamp"
  }
};

export default {
  PAYMENT_CONFIGS_COLLECTION,
  PAYMENT_CONFIG_DOCUMENT_ID,
  paymentProviders,
  paymentModes,
  paymentConfigSchema
};
