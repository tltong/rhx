const {createHash} = require("node:crypto");

const SUBSCRIPTION_INTERVAL_LIMITS = Object.freeze({
  day: 1095,
  week: 156,
  month: 36,
  year: 3,
});

function requireReference(value, fieldName) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error(`${fieldName} is required.`);
  }

  return reference;
}

function requireAmount(value) {
  if (
    value === null
    || value === undefined
    || String(value).trim() === ""
  ) {
    throw new Error("amount is required.");
  }

  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(
      "amount must be a non-negative integer in the currency's smallest unit.",
    );
  }

  return amount;
}

function requireCurrency(value) {
  const currency = String(value ?? "").trim().toLowerCase();

  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("currency must be a three-letter currency code.");
  }

  return currency;
}

function requireStripeProductName(value) {
  const stripeProductName = requireReference(value, "stripeProductName");

  if (stripeProductName.length > 250) {
    throw new Error("stripeProductName must not exceed 250 characters.");
  }

  return stripeProductName;
}

function requireInterval(value) {
  const interval = String(value ?? "").trim().toLowerCase();

  if (!Object.hasOwn(SUBSCRIPTION_INTERVAL_LIMITS, interval)) {
    throw new Error("interval must be day, week, month, or year.");
  }

  return interval;
}

function requireIntervalCount(value, interval) {
  const intervalCount = Number(value);

  if (!Number.isSafeInteger(intervalCount) || intervalCount < 1) {
    throw new Error("intervalCount must be a positive integer.");
  }

  if (intervalCount > SUBSCRIPTION_INTERVAL_LIMITS[interval]) {
    throw new Error("intervalCount must not exceed three years.");
  }

  return intervalCount;
}

function subscriptionPriceLookupKey({
  stripeProductName,
  amount,
  currency,
  interval,
  intervalCount,
}) {
  const productNameDigest = createHash("sha256")
    .update(stripeProductName, "utf8")
    .digest("hex")
    .slice(0, 16);

  return [
    "rhx-subscription",
    currency,
    amount,
    interval,
    intervalCount,
    productNameDigest,
  ].join("-");
}

function requireStripeResultText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`Stripe did not return ${fieldName}.`);
  }

  return text;
}

function requireStripeResultReference(value, fieldName) {
  return requireStripeResultText(
    value && typeof value === "object" ? value.id : value,
    fieldName,
  );
}

function requireStripeTimestamp(value, fieldName) {
  const seconds = Number(value);

  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error(`Stripe did not return a valid ${fieldName}.`);
  }

  const timestamp = new Date(seconds * 1000);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`Stripe did not return a valid ${fieldName}.`);
  }

  return timestamp;
}

function subscriptionPeriod(subscription) {
  const items = subscription?.items?.data;

  if (Array.isArray(items) && items.length > 1) {
    throw new Error(
      "Stripe returned a subscription with multiple billing periods.",
    );
  }

  const item = Array.isArray(items) ? items[0] : null;

  return Object.freeze({
    currentPeriodStart: requireStripeTimestamp(
      item?.current_period_start ?? subscription?.current_period_start,
      "Subscription current period start",
    ),
    currentPeriodEnd: requireStripeTimestamp(
      item?.current_period_end ?? subscription?.current_period_end,
      "Subscription current period end",
    ),
  });
}

function paymentClientSecret(subscription, status) {
  if (status !== "incomplete") {
    return null;
  }

  const invoice = subscription?.latest_invoice;

  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  return String(
    invoice.confirmation_secret?.client_secret
      ?? invoice.payment_intent?.client_secret
      ?? "",
  ).trim() || null;
}

function requireIdempotencyReference(value) {
  const reference = requireReference(value, "idempotencyReference");

  if (reference.length > 500) {
    throw new Error("idempotencyReference must not exceed 500 characters.");
  }

  return reference;
}

function subscriptionCreationIdempotencyKey({
  customerReference,
  idempotencyReference,
}) {
  const digest = createHash("sha256")
    .update(customerReference, "utf8")
    .update("\0", "utf8")
    .update(idempotencyReference, "utf8")
    .digest("hex");

  return `create-payment-subscription-${digest}`;
}

async function getOrCreatePrice(stripeClient, billingTerms) {
  const lookupKey = subscriptionPriceLookupKey(billingTerms);
  const existingPrices = await stripeClient.prices.list({
    active: true,
    lookup_keys: [lookupKey],
    limit: 1,
  });
  const existingReference = String(
    existingPrices?.data?.[0]?.id ?? "",
  ).trim();

  if (existingReference) {
    return existingReference;
  }

  const price = await stripeClient.prices.create({
    currency: billingTerms.currency,
    unit_amount: billingTerms.amount,
    recurring: {
      interval: billingTerms.interval,
      interval_count: billingTerms.intervalCount,
    },
    product_data: {
      name: billingTerms.stripeProductName,
    },
    lookup_key: lookupKey,
  }, {
    idempotencyKey: `create-${lookupKey}`,
  });

  return requireStripeResultText(price?.id, "a Price reference");
}

async function createStripeSubscription(stripeClient, input = {}) {
  const customerReference = requireReference(
    input.customerReference,
    "customerReference",
  );
  const paymentMethodReference = requireReference(
    input.paymentMethodReference,
    "paymentMethodReference",
  );
  const idempotencyReference = requireIdempotencyReference(
    input.idempotencyReference,
  );
  const amount = requireAmount(input.amount);
  const currency = requireCurrency(input.currency);
  const stripeProductName = requireStripeProductName(
    input.stripeProductName,
  );
  const interval = requireInterval(input.interval);
  const intervalCount = requireIntervalCount(
    input.intervalCount,
    interval,
  );

  if (
    typeof stripeClient?.prices?.list !== "function"
    || typeof stripeClient?.prices?.create !== "function"
    || typeof stripeClient?.subscriptions?.create !== "function"
  ) {
    throw new Error(
      "The initialized Stripe client cannot create subscriptions.",
    );
  }

  const priceReference = await getOrCreatePrice(stripeClient, {
    stripeProductName,
    amount,
    currency,
    interval,
    intervalCount,
  });
  const subscription = await stripeClient.subscriptions.create({
    customer: customerReference,
    default_payment_method: paymentMethodReference,
    items: [{price: priceReference}],
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    expand: ["latest_invoice.confirmation_secret"],
  }, {
    idempotencyKey: subscriptionCreationIdempotencyKey({
      customerReference,
      idempotencyReference,
    }),
  });
  const subscriptionReference = requireStripeResultText(
    subscription?.id,
    "a Subscription reference",
  );
  const status = requireStripeResultText(
    subscription?.status,
    "a Subscription status",
  );

  return Object.freeze({
    subscriptionReference,
    status,
    paymentClientSecret: paymentClientSecret(subscription, status),
  });
}

async function retrieveStripeSubscription(
  stripeClient,
  subscriptionReference,
) {
  const reference = requireReference(
    subscriptionReference,
    "subscriptionReference",
  );

  if (typeof stripeClient?.subscriptions?.retrieve !== "function") {
    throw new Error(
      "The initialized Stripe client cannot retrieve subscriptions.",
    );
  }

  const subscription = await stripeClient.subscriptions.retrieve(reference);
  const returnedReference = requireStripeResultText(
    subscription?.id,
    "a Subscription reference",
  );

  if (returnedReference !== reference) {
    throw new Error(
      "Stripe returned an unexpected Subscription reference.",
    );
  }

  const status = requireStripeResultText(
    subscription?.status,
    "a Subscription status",
  );
  const customerReference = requireStripeResultReference(
    subscription?.customer,
    "a Subscription customer reference",
  );
  const subscriptionStartDate = requireStripeTimestamp(
    subscription?.start_date,
    "Subscription start date",
  );
  const {currentPeriodStart, currentPeriodEnd} = subscriptionPeriod(
    subscription,
  );

  if (typeof subscription?.cancel_at_period_end !== "boolean") {
    throw new Error(
      "Stripe did not return a valid Subscription cancel-at-period-end flag.",
    );
  }

  return Object.freeze({
    subscriptionReference: returnedReference,
    customerReference,
    status,
    subscriptionStartDate,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

module.exports = {
  createStripeSubscription,
  retrieveStripeSubscription,
};
