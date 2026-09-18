import {
  PAYMENT_CONFIG_DOCUMENT_ID,
  paymentModes,
  paymentProviders
} from "../../../config/firebase/payment_config_schema.js?v=20260915-payment-provider-enum-v1";

const PAYMENT_MODE_VALUES = new Set(Object.values(paymentModes));
const PAYMENT_PROVIDER_VALUES = new Set(Object.values(paymentProviders));

function requireNonEmptyString(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function normalizeProvider(provider) {
  const normalizedProvider = requireNonEmptyString(
    provider,
    "provider"
  ).toLowerCase();

  if (!PAYMENT_PROVIDER_VALUES.has(normalizedProvider)) {
    throw new Error(
      `provider must be one of: ${[...PAYMENT_PROVIDER_VALUES].join(", ")}.`
    );
  }

  return normalizedProvider;
}

function normalizeMode(mode) {
  const normalizedMode = requireNonEmptyString(mode, "mode").toLowerCase();

  if (!PAYMENT_MODE_VALUES.has(normalizedMode)) {
    throw new Error(
      `mode must be one of: ${[...PAYMENT_MODE_VALUES].join(", ")}.`
    );
  }

  return normalizedMode;
}


function normalizeCustomData(value) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("customData must be a map.");
  }

  return structuredClone(value);
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const date = value instanceof Date
    ? value
    : typeof value?.toDate === "function"
      ? value.toDate()
      : null;

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("updatedAt must be a valid Date or Firestore Timestamp.");
  }

  return value;
}

export class PaymentConfig {
  constructor({
    id = PAYMENT_CONFIG_DOCUMENT_ID,
    provider,
    mode,
    customData = {},
    updatedAt = null
  }) {
    this.id = requireNonEmptyString(id, "id");
    this.provider = normalizeProvider(provider);
    this.mode = normalizeMode(mode);
    this.customData = normalizeCustomData(customData);
    this.updatedAt = normalizeTimestamp(updatedAt);
  }
}

export { paymentModes, paymentProviders };
