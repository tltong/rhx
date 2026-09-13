function requireNonEmptyString(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function normalizeStripeProductName(value) {
  const stripeProductName = requireNonEmptyString(
    value,
    "stripeProductName"
  );

  if (stripeProductName.length > 250) {
    throw new Error("stripeProductName must not exceed 250 characters.");
  }

  return stripeProductName;
}

export function normalizeSubscriptionPlanCountry(country) {
  const normalizedCountry = requireNonEmptyString(country, "country");

  if (normalizedCountry.includes("/")) {
    throw new Error("country cannot contain a forward slash.");
  }

  return normalizedCountry;
}

function normalizePlanId(planId) {
  if (planId === null || planId === undefined) {
    return null;
  }

  return requireNonEmptyString(planId, "planId");
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

export class SubscriptionPlan {
  constructor({
    id = null,
    country,
    name,
    stripeProductName = name,
    months,
    fee
  }) {
    this.id = normalizePlanId(id);
    this.country = normalizeSubscriptionPlanCountry(country);
    this.name = requireNonEmptyString(name, "name");
    this.stripeProductName = normalizeStripeProductName(stripeProductName);
    this.months = requirePositiveInteger(months, "months");
    this.fee = requireNonNegativeNumber(fee, "fee");
  }

  update({ name, stripeProductName, months, fee }) {
    if (name !== undefined) {
      this.name = requireNonEmptyString(name, "name");
    }

    if (stripeProductName !== undefined) {
      this.stripeProductName = normalizeStripeProductName(
        stripeProductName
      );
    }

    if (months !== undefined) {
      this.months = requirePositiveInteger(months, "months");
    }

    if (fee !== undefined) {
      this.fee = requireNonNegativeNumber(fee, "fee");
    }

    return this;
  }
}

export class SubscriptionPlanCatalog {
  constructor({ country, currency, plans = [] }) {
    if (!Array.isArray(plans)) {
      throw new Error("plans must be an array.");
    }

    this.country = normalizeSubscriptionPlanCountry(country);
    this.currency = requireNonEmptyString(currency, "currency");
    this.plans = plans;
  }

  setCurrency(currency) {
    this.currency = requireNonEmptyString(currency, "currency");

    return this;
  }
}
