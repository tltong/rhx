const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);
const WHOLE_UNIT_TWO_DECIMAL_CURRENCIES = new Set(["isk", "ugx"]);

function requireCurrency(value) {
  const currency = String(value ?? "").trim().toLowerCase();

  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("currency must be a three-letter currency code.");
  }

  return currency;
}

function requireFee(value) {
  const fee = Number(value);

  if (!Number.isFinite(fee) || fee < 0) {
    throw new Error("fee must be a non-negative number.");
  }

  return fee;
}

function requireMonths(value) {
  const months = Number(value);

  if (!Number.isInteger(months) || months < 1) {
    throw new Error("months must be a positive integer.");
  }

  if (months > 36) {
    throw new Error("months must not exceed 36 for recurring billing.");
  }

  return months;
}

function requireStripeProductName(value) {
  const stripeProductName = String(value ?? "").trim();

  if (!stripeProductName) {
    throw new Error("stripeProductName is required.");
  }

  if (stripeProductName.length > 250) {
    throw new Error("stripeProductName must not exceed 250 characters.");
  }

  return stripeProductName;
}

function feeToAmount(fee, currency) {
  if (
    WHOLE_UNIT_TWO_DECIMAL_CURRENCIES.has(currency)
    && !Number.isInteger(fee)
  ) {
    throw new Error(`${currency.toUpperCase()} fee must be a whole number.`);
  }

  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
  const amount = Math.round(fee * multiplier);

  if (!Number.isSafeInteger(amount)) {
    throw new Error("fee is too large to convert safely.");
  }

  if (Math.abs((amount / multiplier) - fee) > Number.EPSILON * 100) {
    throw new Error(
      `fee has too many decimal places for ${currency.toUpperCase()}.`,
    );
  }

  return amount;
}

function normalizeBillingTerms(pricing) {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    throw new Error("subscription plan pricing is required.");
  }

  const currency = requireCurrency(pricing.currency);
  const fee = requireFee(pricing.fee);

  return Object.freeze({
    stripeProductName: requireStripeProductName(
      pricing.stripeProductName,
    ),
    amount: feeToAmount(fee, currency),
    currency,
    interval: "month",
    intervalCount: requireMonths(pricing.months),
  });
}

class GetSubscriptionPlanBillingTerms {
  constructor(subscriptionPlanBillingRepository) {
    this.subscriptionPlanBillingRepository =
      subscriptionPlanBillingRepository;
  }

  async execute({country, planId} = {}) {
    const pricing = await this.subscriptionPlanBillingRepository.getPricing(
      country,
      planId,
    );

    return pricing ? normalizeBillingTerms(pricing) : null;
  }
}

module.exports = {
  GetSubscriptionPlanBillingTerms,
  normalizeBillingTerms,
};
