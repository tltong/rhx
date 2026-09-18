const {
  stripeCustomerModes,
} = require("../../../schema/stripe_customer_schema");

const VALID_MODES = new Set(Object.values(stripeCustomerModes));

function requireText(value, fieldName, maximumLength = 500) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  if (text.length > maximumLength) {
    throw new Error(
      `${fieldName} must not exceed ${maximumLength} characters.`,
    );
  }

  return text;
}

function requireDocumentReference(value, fieldName) {
  const reference = requireText(value, fieldName);

  if (reference.includes("/")) {
    throw new Error(`${fieldName} must not contain a slash.`);
  }

  return reference;
}

function normalizeMode(value) {
  const mode = requireText(value, "mode").toLowerCase();

  if (!VALID_MODES.has(mode)) {
    throw new Error(
      `mode must be one of: ${[...VALID_MODES].join(", ")}.`,
    );
  }

  return mode;
}

function normalizeOptionalEmail(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const email = requireText(value, "email", 320);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email must be a valid email address.");
  }

  return email;
}

function normalizeOptionalReference(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return requireDocumentReference(value, fieldName);
}

function normalizeOptionalText(value, fieldName, maximumLength = 100) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return requireText(value, fieldName, maximumLength);
}

function normalizeOptionalDate(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  const dateValue = typeof value?.toDate === "function"
    ? value.toDate()
    : value;
  const date = dateValue instanceof Date
    ? new Date(dateValue.getTime())
    : new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

function requireDate(value, fieldName) {
  const date = normalizeOptionalDate(value, fieldName);

  if (!date) {
    throw new Error(`${fieldName} is required.`);
  }

  return date;
}

function requireNonNegativeNumber(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }

  return number;
}

function requirePositiveInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return number;
}

function normalizeCard(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("card must be a map or null.");
  }

  const last4 = requireText(value.last4, "card.last4", 4);

  if (!/^\d{4}$/.test(last4)) {
    throw new Error("card.last4 must contain four digits.");
  }

  return Object.freeze({
    brand: requireText(value.brand, "card.brand", 100),
    last4,
    expiryMonth: requirePositiveInteger(
      value.expiryMonth,
      "card.expiryMonth",
    ),
    expiryYear: requirePositiveInteger(value.expiryYear, "card.expiryYear"),
  });
}

class StripeCustomerRecord {
  constructor({
    mode,
    customerReference,
    internalReference,
    email = null,
    createdAt,
    updatedAt,
  }) {
    this.mode = normalizeMode(mode);
    this.customerReference = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    this.internalReference = requireText(
      internalReference,
      "internalReference",
    );
    this.email = normalizeOptionalEmail(email);
    this.createdAt = requireDate(createdAt, "createdAt");
    this.updatedAt = requireDate(updatedAt, "updatedAt");
  }

  update({internalReference, email}, updatedAt) {
    if (internalReference !== undefined) {
      this.internalReference = requireText(
        internalReference,
        "internalReference",
      );
    }

    if (email !== undefined) {
      this.email = normalizeOptionalEmail(email);
    }

    this.updatedAt = requireDate(updatedAt, "updatedAt");
    return this;
  }
}

class StripeSetupIntentRecord {
  constructor({
    mode,
    customerReference,
    setupIntentReference,
    status,
    usage,
    paymentMethodReference = null,
    createdAt,
    updatedAt,
  }) {
    this.mode = normalizeMode(mode);
    this.customerReference = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    this.setupIntentReference = requireDocumentReference(
      setupIntentReference,
      "setupIntentReference",
    );
    this.status = requireText(status, "status", 100);
    this.usage = requireText(usage, "usage", 100);
    this.paymentMethodReference = normalizeOptionalReference(
      paymentMethodReference,
      "paymentMethodReference",
    );
    this.createdAt = requireDate(createdAt, "createdAt");
    this.updatedAt = requireDate(updatedAt, "updatedAt");
  }
}

class StripePaymentMethodRecord {
  constructor({
    mode,
    customerReference,
    paymentMethodReference,
    setupIntentReference = null,
    type,
    status,
    card = null,
    createdAt,
    updatedAt,
  }) {
    this.mode = normalizeMode(mode);
    this.customerReference = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    this.paymentMethodReference = requireDocumentReference(
      paymentMethodReference,
      "paymentMethodReference",
    );
    this.setupIntentReference = normalizeOptionalReference(
      setupIntentReference,
      "setupIntentReference",
    );
    this.type = requireText(type, "type", 100);
    this.status = requireText(status, "status", 100);
    this.card = normalizeCard(card);
    this.createdAt = requireDate(createdAt, "createdAt");
    this.updatedAt = requireDate(updatedAt, "updatedAt");
  }
}

class StripeSubscriptionRecord {
  constructor({
    mode,
    customerReference,
    subscriptionReference,
    studentId = null,
    planId = null,
    paymentMethodReference,
    status,
    amount,
    currency,
    interval,
    intervalCount,
    subscriptionStartDate = null,
    currentPeriodStart = null,
    currentPeriodEnd = null,
    cancelAtPeriodEnd = false,
    latestInvoiceReference = null,
    latestInvoiceStatus = null,
    latestPaymentStatus = null,
    paymentActionRequiredAt = null,
    createdAt,
    updatedAt,
  }) {
    this.mode = normalizeMode(mode);
    this.customerReference = requireDocumentReference(
      customerReference,
      "customerReference",
    );
    this.subscriptionReference = requireDocumentReference(
      subscriptionReference,
      "subscriptionReference",
    );
    this.studentId = normalizeOptionalReference(studentId, "studentId");
    this.planId = normalizeOptionalReference(planId, "planId");
    this.paymentMethodReference = requireDocumentReference(
      paymentMethodReference,
      "paymentMethodReference",
    );
    this.status = requireText(status, "status", 100);
    this.amount = requireNonNegativeNumber(amount, "amount");
    this.currency = requireText(currency, "currency", 20).toLowerCase();
    this.interval = requireText(interval, "interval", 50).toLowerCase();
    this.intervalCount = requirePositiveInteger(
      intervalCount,
      "intervalCount",
    );
    this.subscriptionStartDate = normalizeOptionalDate(
      subscriptionStartDate,
      "subscriptionStartDate",
    );
    this.currentPeriodStart = normalizeOptionalDate(
      currentPeriodStart,
      "currentPeriodStart",
    );
    this.currentPeriodEnd = normalizeOptionalDate(
      currentPeriodEnd,
      "currentPeriodEnd",
    );
    this.cancelAtPeriodEnd = Boolean(cancelAtPeriodEnd);
    this.latestInvoiceReference = normalizeOptionalReference(
      latestInvoiceReference,
      "latestInvoiceReference",
    );
    this.latestInvoiceStatus = normalizeOptionalText(
      latestInvoiceStatus,
      "latestInvoiceStatus",
    );
    this.latestPaymentStatus = normalizeOptionalText(
      latestPaymentStatus,
      "latestPaymentStatus",
    );
    this.paymentActionRequiredAt = normalizeOptionalDate(
      paymentActionRequiredAt,
      "paymentActionRequiredAt",
    );
    this.createdAt = requireDate(createdAt, "createdAt");
    this.updatedAt = requireDate(updatedAt, "updatedAt");
  }
}

module.exports = {
  StripeCustomerRecord,
  StripeSetupIntentRecord,
  StripePaymentMethodRecord,
  StripeSubscriptionRecord,
  normalizeMode,
  normalizeOptionalDate,
  requireDocumentReference,
  requireText,
};
