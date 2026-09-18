const {
  paymentModes,
  paymentProviders,
  subscriptionTypes,
} = require("../../../schema/subscription_schema");

const SUBSCRIPTION_TYPE_VALUES = new Set(Object.values(subscriptionTypes));
const PAYMENT_MODE_VALUES = new Set(Object.values(paymentModes));
const PAYMENT_PROVIDER_VALUES = new Set(Object.values(paymentProviders));
const PAYMENT_LINK_FIELDS = Object.freeze([
  "paymentProvider",
  "paymentMode",
  "paymentCustomerReference",
  "paymentSubscriptionReference",
  "planId",
]);

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
    "subscriptionType",
  ).toLowerCase();

  if (!SUBSCRIPTION_TYPE_VALUES.has(normalizedType)) {
    throw new Error(
      `subscriptionType must be one of: ${[
        ...SUBSCRIPTION_TYPE_VALUES,
      ].join(", ")}.`,
    );
  }

  return normalizedType;
}

function normalizeOptionalString(value, name) {
  if (value === null || value === undefined) {
    return null;
  }

  return requireNonEmptyString(value, name);
}

function normalizeOptionalEnum(value, name, allowedValues) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = requireNonEmptyString(value, name).toLowerCase();

  if (!allowedValues.has(normalizedValue)) {
    throw new Error(
      `${name} must be one of: ${[...allowedValues].join(", ")}.`,
    );
  }

  return normalizedValue;
}

function normalizeTimestamp(value, name, {optional = false} = {}) {
  if ((value === null || value === undefined) && optional) {
    return null;
  }

  const date = value instanceof Date
    ? value
    : typeof value?.toDate === "function"
      ? value.toDate()
      : null;

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(
      `${name} must be a valid Date or Firestore Timestamp.`,
    );
  }

  return value;
}

function validatePaymentLink(subscription) {
  const configuredFields = PAYMENT_LINK_FIELDS.filter(
    (fieldName) => subscription[fieldName] !== null,
  );

  if (
    subscription.subscriptionType === subscriptionTypes.TRIAL
    && configuredFields.length > 0
  ) {
    throw new Error(
      "Trial subscriptions cannot contain payment-provider linkage.",
    );
  }

  if (
    configuredFields.length > 0
    && configuredFields.length !== PAYMENT_LINK_FIELDS.length
  ) {
    throw new Error(
      `Payment linkage must provide all of: ${PAYMENT_LINK_FIELDS.join(
        ", ",
      )}.`,
    );
  }

  if (subscription.paymentProvider === paymentProviders.STRIPE) {
    if (!subscription.paymentCustomerReference.startsWith("cus_")) {
      throw new Error(
        "paymentCustomerReference must be a Stripe customer reference.",
      );
    }

    if (!subscription.paymentSubscriptionReference.startsWith("sub_")) {
      throw new Error(
        "paymentSubscriptionReference must be a Stripe subscription reference.",
      );
    }
  }
}

class StudentSubscription {
  constructor({
    studentId,
    subscriptionType,
    activeUntil = null,
    paymentProvider = null,
    paymentMode = null,
    paymentCustomerReference = null,
    paymentSubscriptionReference = null,
    planId = null,
    createdAt = null,
    updatedAt = null,
  }) {
    this.studentId = requireNonEmptyString(studentId, "studentId");
    this.subscriptionType = normalizeSubscriptionType(subscriptionType);
    this.activeUntil = normalizeTimestamp(activeUntil, "activeUntil", {
      optional: true,
    });
    this.paymentProvider = normalizeOptionalEnum(
      paymentProvider,
      "paymentProvider",
      PAYMENT_PROVIDER_VALUES,
    );
    this.paymentMode = normalizeOptionalEnum(
      paymentMode,
      "paymentMode",
      PAYMENT_MODE_VALUES,
    );
    this.paymentCustomerReference = normalizeOptionalString(
      paymentCustomerReference,
      "paymentCustomerReference",
    );
    this.paymentSubscriptionReference = normalizeOptionalString(
      paymentSubscriptionReference,
      "paymentSubscriptionReference",
    );
    this.planId = normalizeOptionalString(planId, "planId");
    this.createdAt = normalizeTimestamp(createdAt, "createdAt", {
      optional: true,
    });
    this.updatedAt = normalizeTimestamp(updatedAt, "updatedAt", {
      optional: true,
    });
    validatePaymentLink(this);
  }

  update(changes = {}, updatedAt = new Date()) {
    const valueFor = (fieldName) => (
      changes[fieldName] !== undefined
        ? changes[fieldName]
        : this[fieldName]
    );
    const candidate = new StudentSubscription({
      studentId: this.studentId,
      subscriptionType: valueFor("subscriptionType"),
      activeUntil: valueFor("activeUntil"),
      paymentProvider: valueFor("paymentProvider"),
      paymentMode: valueFor("paymentMode"),
      paymentCustomerReference: valueFor("paymentCustomerReference"),
      paymentSubscriptionReference: valueFor(
        "paymentSubscriptionReference",
      ),
      planId: valueFor("planId"),
      createdAt: this.createdAt,
      updatedAt,
    });

    Object.assign(this, candidate);
    return this;
  }
}

module.exports = {
  paymentModes,
  paymentProviders,
  StudentSubscription,
  subscriptionTypes,
};
