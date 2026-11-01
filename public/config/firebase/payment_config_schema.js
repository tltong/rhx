export const PAYMENT_CONFIGS_COLLECTION = "paymentConfigs";
export const PAYMENT_CONFIG_DOCUMENT_ID = "default";
export const paymentProviders = Object.freeze({
  "STRIPE": "stripe"
});
export const paymentModes = Object.freeze({
  "TEST": "test",
  "PROD": "prod"
});
export const paymentConfigSchema = {
  "collection": "paymentConfigs",
  "documentId": "default",
  "fields": {
    "provider": {
      "type": "string",
      "enum": [
        "stripe"
      ]
    },
    "mode": {
      "type": "string",
      "enum": [
        "test",
        "prod"
      ]
    },
    "customData": "map",
    "renewalRetryPolicy": {
      "type": "map",
      "fields": {
        "maxRetries": {
          "type": "number",
          "minimum": 0,
          "maximum": 10
        },
        "intervalHours": {
          "type": "number",
          "minimum": 1,
          "maximum": 168
        },
        "gracePeriodHours": {
          "type": "number",
          "minimum": 1,
          "maximum": 1680
        }
      }
    },
    "updatedAt": "timestamp"
  }
};
export const defaultRenewalRetryPolicy = Object.freeze({
  "maxRetries": 3,
  "intervalHours": 24,
  "gracePeriodHours": 72
});
export default {PAYMENT_CONFIGS_COLLECTION, PAYMENT_CONFIG_DOCUMENT_ID, paymentProviders, paymentModes, paymentConfigSchema, defaultRenewalRetryPolicy};
