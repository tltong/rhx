import {
  subscriptionTypes
} from "../../../config/firebase/subscription_schema.js?v=20260829-student-subscriptions-v1";

const SUBSCRIPTION_TYPE_VALUES = new Set(Object.values(subscriptionTypes));

function requireNonEmptyString(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function normalizeSubscriptionType(subscriptionType) {
  const normalizedType = requireNonEmptyString(
    subscriptionType,
    "subscriptionType"
  ).toLowerCase();

  if (!SUBSCRIPTION_TYPE_VALUES.has(normalizedType)) {
    throw new Error(
      `subscriptionType must be one of: ${[...SUBSCRIPTION_TYPE_VALUES].join(", ")}.`
    );
  }

  return normalizedType;
}

function normalizeTimestamp(value, name, { optional = false } = {}) {
  if ((value === null || value === undefined) && optional) {
    return null;
  }

  const date = value instanceof Date
    ? value
    : typeof value?.toDate === "function"
      ? value.toDate()
      : null;

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid Date or Firestore Timestamp.`);
  }

  return value;
}

function requirePositiveInteger(value, name) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return numberValue;
}

function requireNonNegativeNumber(value, name) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return numberValue;
}

export class StudentSubscription {
  constructor({
    studentId,
    subscriptionType,
    activeUntil,
    createdAt = null,
    updatedAt = null
  }) {
    this.studentId = requireNonEmptyString(studentId, "studentId");
    this.subscriptionType = normalizeSubscriptionType(subscriptionType);
    this.activeUntil = normalizeTimestamp(activeUntil, "activeUntil", {
      optional: true
    });
    this.createdAt = normalizeTimestamp(createdAt, "createdAt", {
      optional: true
    });
    this.updatedAt = normalizeTimestamp(updatedAt, "updatedAt", {
      optional: true
    });
  }

  update({ subscriptionType, activeUntil }, updatedAt = new Date()) {
    if (subscriptionType !== undefined) {
      this.subscriptionType = normalizeSubscriptionType(subscriptionType);
    }

    if (activeUntil !== undefined) {
      this.activeUntil = normalizeTimestamp(activeUntil, "activeUntil", {
        optional: true
      });
    }

    this.updatedAt = normalizeTimestamp(updatedAt, "updatedAt");

    return this;
  }
}

export class SubscriptionPayment {
  constructor({
    id = null,
    studentId,
    guardianId,
    planId,
    durationMonths,
    amountPaid,
    currency,
    paymentDate,
    paymentProvider,
    paymentProviderReference,
    createdAt = null
  }) {
    this.id = id === null
      ? null
      : requireNonEmptyString(id, "id");
    this.studentId = requireNonEmptyString(studentId, "studentId");
    this.guardianId = requireNonEmptyString(guardianId, "guardianId");
    this.planId = requireNonEmptyString(planId, "planId");
    this.durationMonths = requirePositiveInteger(
      durationMonths,
      "durationMonths"
    );
    this.amountPaid = requireNonNegativeNumber(amountPaid, "amountPaid");
    this.currency = requireNonEmptyString(currency, "currency");
    this.paymentDate = normalizeTimestamp(paymentDate, "paymentDate");
    this.paymentProvider = requireNonEmptyString(
      paymentProvider,
      "paymentProvider"
    );
    this.paymentProviderReference = requireNonEmptyString(
      paymentProviderReference,
      "paymentProviderReference"
    );
    this.createdAt = normalizeTimestamp(createdAt, "createdAt", {
      optional: true
    });
  }
}

export { subscriptionTypes };
