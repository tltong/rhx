import {
  PAYMENT_CONFIG_DOCUMENT_ID,
  paymentModes,
  paymentProviders,
  defaultRenewalRetryPolicy
} from "../../../config/firebase/payment_config_schema.js?v=20261031-renewal-restart-v1";

const PAYMENT_MODE_VALUES = new Set(Object.values(paymentModes));
const PAYMENT_PROVIDER_VALUES = new Set(Object.values(paymentProviders));

export function normalizeRenewalRetryPolicy(value = defaultRenewalRetryPolicy) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !Number.isInteger(value.maxRetries) || value.maxRetries < 0 || value.maxRetries > 10
    || !Number.isInteger(value.intervalHours) || value.intervalHours < 1 || value.intervalHours > 168) {
    throw new Error("Renewal retry policy requires 0–10 additional retries and an interval of 1–168 whole hours.");
  }
  const gracePeriodHours = value.gracePeriodHours === undefined ? 72 : value.gracePeriodHours;
  if (!Number.isInteger(gracePeriodHours) || gracePeriodHours < 1 || gracePeriodHours > 1680) {
    throw new Error("Suspension grace period must be 1–1680 whole hours.");
  }
  return Object.freeze({maxRetries: value.maxRetries, intervalHours: value.intervalHours, gracePeriodHours});
}

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
    renewalRetryPolicy,
    updatedAt = null
  }) {
    this.id = requireNonEmptyString(id, "id");
    this.provider = normalizeProvider(provider);
    this.mode = normalizeMode(mode);
    this.customData = normalizeCustomData(customData);
    this.renewalRetryPolicy = normalizeRenewalRetryPolicy(renewalRetryPolicy);
    this.updatedAt = normalizeTimestamp(updatedAt);
  }
}

export { paymentModes, paymentProviders, defaultRenewalRetryPolicy };
