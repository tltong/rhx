const PAYMENT_CONFIGS_COLLECTION = "paymentConfigs";
const PAYMENT_CONFIG_DOCUMENT_ID = "default";

const paymentProviders = Object.freeze({
  STRIPE: "stripe",
});

const paymentModes = Object.freeze({
  TEST: "test",
  PROD: "prod",
});

const defaultRenewalRetryPolicy = Object.freeze({maxRetries: 3, intervalHours: 24, gracePeriodHours: 72});


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
    renewalRetryPolicy: {type: "map", fields: {
      maxRetries: {type: "number", minimum: 0, maximum: 10},
      intervalHours: {type: "number", minimum: 1, maximum: 168},
      gracePeriodHours: {type: "number", minimum: 1, maximum: 1680},
    }},
    updatedAt: "timestamp",
  },
};

module.exports = {
  PAYMENT_CONFIGS_COLLECTION,
  PAYMENT_CONFIG_DOCUMENT_ID,
  paymentProviders,
  paymentModes,
  paymentConfigSchema,
  defaultRenewalRetryPolicy,
};
