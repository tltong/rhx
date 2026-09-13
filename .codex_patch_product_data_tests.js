const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;

function update(relativePath, pairs) {
  const filePath = path.join(root, relativePath);
  const original = fs.readFileSync(filePath, "utf8");
  const usesCrLf = original.includes("\r\n");
  let source = original.replace(/\r\n/g, "\n");

  for (const [before, after] of pairs) {
    const occurrences = source.split(before).length - 1;

    if (occurrences !== 1) {
      throw new Error(
        `Expected one match in ${relativePath}, found ${occurrences}`,
      );
    }

    source = source.replace(before, after);
  }

  fs.writeFileSync(
    filePath,
    usesCrLf ? source.replace(/\n/g, "\r\n") : source,
    "utf8",
  );
}

update("public/features/syllabus_subscription/domain/subscription_plan.js", [[
  `  return Object.freeze({
    name: requireNonEmptyString(productData.name, "productData.name")
  });`,
  `  const name = requireNonEmptyString(
    productData.name,
    "productData.name"
  );

  if (name.length > 250) {
    throw new Error("productData.name must not exceed 250 characters.");
  }

  return Object.freeze({name});`,
]]);

update(
  "functions/features/syllabus_subscription/application/get_subscription_plan_billing_terms.js",
  [[
    `  if (!name) {
    throw new Error("productData.name is required.");
  }

  return Object.freeze({name});`,
    `  if (!name) {
    throw new Error("productData.name is required.");
  }

  if (name.length > 250) {
    throw new Error("productData.name must not exceed 250 characters.");
  }

  return Object.freeze({name});`,
  ]],
);

update(
  "functions/features/stripe_payment/domain/stripe_subscription.js",
  [[
    `  const name = requireReference(value.name, "productData.name");

  return Object.freeze({name});`,
    `  const name = requireReference(value.name, "productData.name");

  if (name.length > 250) {
    throw new Error("productData.name must not exceed 250 characters.");
  }

  return Object.freeze({name});`,
  ]],
);

update(
  "functions/features/syllabus_subscription/subscription_plan_billing_terms_feature.test.js",
  [
    [
      `        currency: "MYR",
        fee: 59.9,
        months: 3,`,
      `        currency: "MYR",
        fee: 59.9,
        months: 3,
        productData: {name: "RHX Quarterly"},`,
    ],
    [
      `    interval: "month",
    intervalCount: 3,
  });`,
      `    interval: "month",
    intervalCount: 3,
    productData: {name: "RHX Quarterly"},
  });`,
    ],
    [
      `    currency: "JPY",
    fee: 500,
    months: 1,`,
      `    currency: "JPY",
    fee: 500,
    months: 1,
    productData: {name: "RHX Monthly"},`,
    ],
    [
      `    interval: "month",
    intervalCount: 1,
  });`,
      `    interval: "month",
    intervalCount: 1,
    productData: {name: "RHX Monthly"},
  });`,
    ],
    [
      `      currency: "MYR",
      fee: 10.999,
      months: 1,`,
      `      currency: "MYR",
      fee: 10.999,
      months: 1,
      productData: {name: "RHX Monthly"},`,
    ],
    [
      `      currency: "MYR",
      fee: 10,
      months: 37,`,
      `      currency: "MYR",
      fee: 10,
      months: 37,
      productData: {name: "RHX Long Term"},`,
    ],
    [
      `        ? {currency: "SGD"}
        : {fee: 25, months: 1};`,
      `        ? {currency: "SGD"}
        : {
            fee: 25,
            months: 1,
            productData: {name: "RHX Singapore Monthly"},
          };`,
    ],
    [
      `    {currency: "SGD", fee: 25, months: 1},`,
      `    {
      currency: "SGD",
      fee: 25,
      months: 1,
      productData: {name: "RHX Singapore Monthly"},
    },`,
    ],
    [
      `test("rejects path separators in country and plan IDs", async () => {`,
      `test("falls back to the plan name for legacy plan documents", async () => {
  const repository = new FirestoreSubscriptionPlanBillingRepository({
    async readPlanDocument(collectionPath) {
      return collectionPath === "subscription_plans"
        ? {currency: "MYR"}
        : {name: "Legacy Monthly", fee: 10, months: 1};
    },
  });

  assert.deepEqual(
    await repository.getPricing("Malaysia", "legacy-plan"),
    {
      currency: "MYR",
      fee: 10,
      months: 1,
      productData: {name: "Legacy Monthly"},
    },
  );
});

test("rejects invalid Stripe product data", () => {
  assert.throws(
    () => normalizeBillingTerms({
      currency: "MYR",
      fee: 10,
      months: 1,
      productData: {name: ""},
    }),
    /productData.name is required/,
  );
  assert.throws(
    () => normalizeBillingTerms({
      currency: "MYR",
      fee: 10,
      months: 1,
      productData: {name: "x".repeat(251)},
    }),
    /must not exceed 250 characters/,
  );
});

test("rejects path separators in country and plan IDs", async () => {`,
    ],
  ],
);

update(
  "functions/features/stripe_payment_subscription/stripe_payment_subscription_feature.test.js",
  [
    [
      `    interval: "month",
    intervalCount: 3,
  };`,
      `    interval: "month",
    intervalCount: 3,
    productData: {name: "RHX Quarterly"},
  };`,
    ],
    [
      `      interval: "month",
      intervalCount: 3,
      idempotencyReference:`,
      `      interval: "month",
      intervalCount: 3,
      productData: {name: "RHX Quarterly"},
      idempotencyReference:`,
    ],
  ],
);

update(
  "functions/features/stripe_payment/stripe_subscription_feature.test.js",
  [
    [
      `const assert = require("node:assert/strict");
const test = require("node:test");`,
      `const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");
const test = require("node:test");`,
    ],
    [
      `function stripeClient(overrides = {}) {`,
      `function priceLookupKey({amount, currency, intervalCount, productName}) {
  const fingerprint = createHash("sha256")
    .update(productName, "utf8")
    .digest("hex")
    .slice(0, 16);

  return [
    "rhx-subscription-v2",
    currency,
    amount,
    "month",
    intervalCount,
    fingerprint,
  ].join("-");
}

function stripeClient(overrides = {}) {`,
    ],
    [
      `  const result = await payment.createSubscription({`,
      `  const lookupKey = priceLookupKey({
    amount: 4500,
    currency: "myr",
    intervalCount: 3,
    productName: "RHX Quarterly",
  });
  const result = await payment.createSubscription({`,
    ],
    [
      `    intervalCount: 3,
    idempotencyReference: "checkout-attempt-123",`,
      `    intervalCount: 3,
    productData: {name: "RHX Quarterly"},
    idempotencyReference: "checkout-attempt-123",`,
    ],
    [
      `      lookup_keys: ["rhx-subscription-myr-4500-month-3"],`,
      `      lookup_keys: [lookupKey],`,
    ],
    [
      `      product_data: {
        name: "RHX Subscription",
      },
      lookup_key: "rhx-subscription-myr-4500-month-3",`,
      `      product_data: {
        name: "RHX Quarterly",
      },
      lookup_key: lookupKey,`,
    ],
    [
      `      idempotencyKey: "create-rhx-subscription-myr-4500-month-3",`,
      `      idempotencyKey: \`create-\${lookupKey}\`,`,
    ],
    [
      `    intervalCount: 1,
    idempotencyReference: "checkout-attempt-456",`,
      `    intervalCount: 1,
    productData: {name: "RHX Monthly"},
    idempotencyReference: "checkout-attempt-456",`,
    ],
    [
      `    intervalCount: 1,
    idempotencyReference: "checkout-attempt-789",`,
      `    intervalCount: 1,
    productData: {name: "RHX Monthly"},
    idempotencyReference: "checkout-attempt-789",`,
    ],
    [
      `  await assert.rejects(
    () => payment.createSubscription({
      ...validInput,
      idempotencyReference: "",
    }),`,
      `  await assert.rejects(
    () => payment.createSubscription({
      ...validInput,
      productData: {name: ""},
    }),
    /productData.name is required/,
  );
  await assert.rejects(
    () => payment.createSubscription({
      ...validInput,
      idempotencyReference: "",
    }),`,
    ],
    [
      `    intervalCount: 1,
    idempotencyReference: "same-checkout-attempt",`,
      `    intervalCount: 1,
    productData: {name: "RHX Monthly"},
    idempotencyReference: "same-checkout-attempt",`,
    ],
  ],
);

update(
  "public/features/syllabus_subscription/subscription_plan_feature.test.mjs",
  [
    [
      `    name: "Invalid months",
    months: 0,`,
      `    name: "Invalid months",
    productData: {name: "Invalid months"},
    months: 0,`,
    ],
    [
      `    name: "Invalid fee",
    months: 1,`,
      `    name: "Invalid fee",
    productData: {name: "Invalid fee"},
    months: 1,`,
    ],
    [
      `    name: "Quarterly",
    months: 3,`,
      `    name: "Quarterly",
    productData: {name: "RHX Quarterly"},
    months: 3,`,
    ],
    [
      `  assert.equal(plan.months, 3);
  assert.equal(plan.fee, 59.9);`,
      `  assert.deepEqual(plan.productData, {name: "RHX Quarterly"});
  assert.equal(plan.months, 3);
  assert.equal(plan.fee, 59.9);`,
    ],
    [
      `    name: "Monthly",
    months: 1,`,
      `    name: "Monthly",
    productData: {name: "RHX Monthly"},
    months: 1,`,
    ],
    [
      `    name: "Monthly Plus",
    fee: 25`,
      `    name: "Monthly Plus",
    productData: {name: "RHX Monthly Plus"},
    fee: 25`,
    ],
    [
      `  assert.equal(updated.name, "Monthly Plus");
  assert.equal(updated.months, 1);`,
      `  assert.equal(updated.name, "Monthly Plus");
  assert.deepEqual(
    updated.productData,
    {name: "RHX Monthly Plus"}
  );
  assert.equal(updated.months, 1);`,
    ],
    [
      `test("plan creation requires currency and receives a generated ID", async () => {`,
      `test("subscription plan validates Stripe product data", () => {
  assert.throws(() => new SubscriptionPlan({
    country: "Malaysia",
    name: "Missing Stripe name",
    productData: {name: ""},
    months: 1,
    fee: 10
  }), /productData.name is required/);

  assert.throws(() => new SubscriptionPlan({
    country: "Malaysia",
    name: "Long Stripe name",
    productData: {name: "x".repeat(251)},
    months: 1,
    fee: 10
  }), /must not exceed 250 characters/);
});

test("plan creation requires currency and receives a generated ID", async () => {`,
    ],
  ],
);
