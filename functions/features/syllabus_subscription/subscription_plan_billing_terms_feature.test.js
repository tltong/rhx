const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GetSubscriptionPlanBillingTerms,
  normalizeBillingTerms,
} = require("./application/get_subscription_plan_billing_terms");
const {
  FirestoreSubscriptionPlanBillingRepository,
} = require(
  "./infrastructure/firestore_subscription_plan_billing_repository"
);
const subscriptionPlanModule = require("./subscription_plan_module");

test("subscription plan module exposes normalized billing terms", () => {
  assert.deepEqual(Object.keys(subscriptionPlanModule), [
    "getSubscriptionPlanBillingTerms",
  ]);
});

test("returns Stripe billing terms for a subscription plan", async () => {
  const useCase = new GetSubscriptionPlanBillingTerms({
    async getPricing(country, planId) {
      assert.equal(country, "Malaysia");
      assert.equal(planId, "plan-quarterly");
      return {
        currency: "MYR",
        fee: 59.9,
        months: 3,
        stripeProductName: "RHX Quarterly Learning",
      };
    },
  });

  assert.deepEqual(await useCase.execute({
    country: "Malaysia",
    planId: "plan-quarterly",
  }), {
    stripeProductName: "RHX Quarterly Learning",
    amount: 5990,
    currency: "myr",
    interval: "month",
    intervalCount: 3,
  });
});

test("normalizes Stripe zero-decimal currency amounts", () => {
  assert.deepEqual(normalizeBillingTerms({
    currency: "JPY",
    fee: 500,
    months: 1,
    stripeProductName: "RHX Monthly Learning",
  }), {
    stripeProductName: "RHX Monthly Learning",
    amount: 500,
    currency: "jpy",
    interval: "month",
    intervalCount: 1,
  });
});

test("rejects unsupported fee precision and recurring duration", () => {
  assert.throws(
    () => normalizeBillingTerms({
      currency: "MYR",
      fee: 10.999,
      months: 1,
      stripeProductName: "RHX Monthly Learning",
    }),
    /too many decimal places/,
  );
  assert.throws(
    () => normalizeBillingTerms({
      currency: "MYR",
      fee: 10,
      months: 37,
      stripeProductName: "RHX Long-term Learning",
    }),
    /must not exceed 36/,
  );
});

test("rejects an invalid Stripe product name", () => {
  assert.throws(
    () => normalizeBillingTerms({
      currency: "MYR",
      fee: 10,
      months: 1,
      stripeProductName: " ",
    }),
    /stripeProductName is required/,
  );
  assert.throws(
    () => normalizeBillingTerms({
      currency: "MYR",
      fee: 10,
      months: 1,
      stripeProductName: "x".repeat(251),
    }),
    /stripeProductName must not exceed 250 characters/,
  );
});

test("returns null when the catalog or plan is missing", async () => {
  const useCase = new GetSubscriptionPlanBillingTerms({
    async getPricing() {
      return null;
    },
  });

  assert.equal(await useCase.execute({
    country: "Malaysia",
    planId: "missing-plan",
  }), null);
});

test("reads currency and plan pricing from their Firestore paths", async () => {
  const reads = [];
  const repository = new FirestoreSubscriptionPlanBillingRepository({
    async readPlanDocument(collectionPath, documentId) {
      reads.push([collectionPath, documentId]);

      return collectionPath === "subscription_plans"
        ? {currency: "SGD"}
        : {
          fee: 25,
          months: 1,
          stripeProductName: "RHX Singapore Learning",
        };
    },
  });

  assert.deepEqual(
    await repository.getPricing("Singapore", "plan-monthly"),
    {
      currency: "SGD",
      fee: 25,
      months: 1,
      stripeProductName: "RHX Singapore Learning",
    },
  );
  assert.deepEqual(reads, [
    ["subscription_plans", "Singapore"],
    ["subscription_plans/Singapore/plans", "plan-monthly"],
  ]);
});

test("rejects path separators in country and plan IDs", async () => {
  const repository = new FirestoreSubscriptionPlanBillingRepository({
    async readPlanDocument() {
      throw new Error("Firestore should not be read.");
    },
  });

  await assert.rejects(
    () => repository.getPricing("Malaysia/plans", "plan-1"),
    /country must not contain a slash/,
  );
  await assert.rejects(
    () => repository.getPricing("Malaysia", "plans/plan-1"),
    /planId must not contain a slash/,
  );
});
