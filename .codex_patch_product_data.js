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

    if (occurrences < 1) {
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

update("public/config/firebase/subscription_plans_schema.js", [[
  `        name: "string",
        months: "number",`,
  `        name: "string",
        productData: {
          type: "map",
          fields: {
            name: "string"
          }
        },
        months: "number",`,
]]);

update("functions/schema/subscription_plans_schema.js", [[
  `        name: "string",
        months: "number",`,
  `        name: "string",
        productData: {
          type: "map",
          fields: {
            name: "string",
          },
        },
        months: "number",`,
]]);

update("public/features/syllabus_subscription/domain/subscription_plan.js", [
  [
    `export function normalizeSubscriptionPlanCountry(country) {`,
    `function normalizeProductData(productData) {
  if (
    !productData
    || typeof productData !== "object"
    || Array.isArray(productData)
  ) {
    throw new Error("productData must be an object.");
  }

  return Object.freeze({
    name: requireNonEmptyString(productData.name, "productData.name")
  });
}

export function normalizeSubscriptionPlanCountry(country) {`,
  ],
  [
    `    name,
    months,`,
    `    name,
    productData,
    months,`,
  ],
  [
    `    this.name = requireNonEmptyString(name, "name");
    this.months = requirePositiveInteger(months, "months");`,
    `    this.name = requireNonEmptyString(name, "name");
    this.productData = normalizeProductData(productData);
    this.months = requirePositiveInteger(months, "months");`,
  ],
  [
    `  update({ name, months, fee }) {`,
    `  update({ name, productData, months, fee }) {`,
  ],
  [
    `    if (months !== undefined) {`,
    `    if (productData !== undefined) {
      this.productData = normalizeProductData(productData);
    }

    if (months !== undefined) {`,
  ],
]);

update(
  "public/features/syllabus_subscription/infrastructure/firestore_subscription_plan_repository.js",
  [
    [
      `} from "../../../config/firebase/subscription_plans_schema.js?v=20260829-subscription-plans-v1";`,
      `} from "../../../config/firebase/subscription_plans_schema.js?v=20260911-subscription-product-data-v1";`,
    ],
    [
      `} from "../domain/subscription_plan.js?v=20260829-subscription-plans-v1";`,
      `} from "../domain/subscription_plan.js?v=20260911-subscription-product-data-v1";`,
    ],
    [
      `    name: data.name,
    months: data.months,`,
      `    name: data.name,
    productData: data.productData ?? {name: data.name},
    months: data.months,`,
    ],
    [
      `    name: plan.name,
    months: plan.months,`,
      `    name: plan.name,
    productData: plan.productData,
    months: plan.months,`,
    ],
  ],
);

update(
  "public/features/syllabus_subscription/application/create_subscription_plan.js",
  [[
    `} from "../domain/subscription_plan.js?v=20260829-subscription-plans-v1";`,
    `} from "../domain/subscription_plan.js?v=20260911-subscription-product-data-v1";`,
  ]],
);

update("public/features/syllabus_subscription/subscription_plan_module.js", [
  [
    ` * createSubscriptionPlan({country, name, months, fee})`,
    ` * createSubscriptionPlan({country, name, productData, months, fee})`,
  ],
  [
    ` * updateSubscriptionPlan({country, planId, name?, months?, fee?})`,
    ` * updateSubscriptionPlan({country, planId, name?, productData?,
 *   months?, fee?})`,
  ],
  [
    `} from "./application/create_subscription_plan.js?v=20260829-subscription-plans-v1";`,
    `} from "./application/create_subscription_plan.js?v=20260911-subscription-product-data-v1";`,
  ],
  [
    `} from "./infrastructure/firestore_subscription_plan_repository.js?v=20260829-subscription-plans-v1";`,
    `} from "./infrastructure/firestore_subscription_plan_repository.js?v=20260911-subscription-product-data-v1";`,
  ],
]);

update(
  "public/features/syllabus_subscription/syllabus_subscription_module.js",
  [[
    `} from "./subscription_plan_module.js?v=20260829-subscription-plans-v1";`,
    `} from "./subscription_plan_module.js?v=20260911-subscription-product-data-v1";`,
  ]],
);

update(
  "public/features/syllabus_subscription/pages/subscription_plan_admin/subscription_plan_admin.html",
  [
    [
      `<link rel="stylesheet" href="./subscription_plan_admin.css?v=20260829-subscription-plan-admin-v1">`,
      `<link rel="stylesheet" href="./subscription_plan_admin.css?v=20260911-subscription-product-data-v1">`,
    ],
    [
      `          <label>
            Months
            <input name="months" type="number" min="1" step="1" required>
          </label>`,
      `          <label>
            Stripe product name
            <input name="productName" type="text" maxlength="250" required>
          </label>
          <label>
            Months
            <input name="months" type="number" min="1" step="1" required>
          </label>`,
    ],
    [
      `data-page-module="./subscription_plan_admin.js?v=20260829-subscription-plan-admin-v1"`,
      `data-page-module="./subscription_plan_admin.js?v=20260911-subscription-product-data-v1"`,
    ],
  ],
);

update(
  "public/features/syllabus_subscription/pages/subscription_plan_admin/subscription_plan_admin.js",
  [
    [
      `} from "../../syllabus_subscription_module.js?v=20260829-subscription-plan-admin-v1";`,
      `} from "../../syllabus_subscription_module.js?v=20260911-subscription-product-data-v1";`,
    ],
    [
      `    const monthsInput = createNumberInput("months", plan.months, {`,
      `    const productNameInput = document.createElement("input");
    const monthsInput = createNumberInput("months", plan.months, {`,
    ],
    [
      `    nameInput.addEventListener("input", updateControls);
    saveButton.type = "submit";`,
      `    nameInput.addEventListener("input", updateControls);
    productNameInput.name = "productName";
    productNameInput.type = "text";
    productNameInput.maxLength = 250;
    productNameInput.value = plan.productData.name;
    productNameInput.required = true;
    productNameInput.addEventListener("input", updateControls);
    saveButton.type = "submit";`,
    ],
    [
      `      createField("Plan name", nameInput),
      createField("Months", monthsInput),`,
      `      createField("Plan name", nameInput),
      createField("Stripe product name", productNameInput),
      createField("Months", monthsInput),`,
    ],
    [
      `          name: nameInput.value,
          months: Number(monthsInput.value),`,
      `          name: nameInput.value,
          productData: {name: productNameInput.value},
          months: Number(monthsInput.value),`,
    ],
    [
      `      name: data.get("name"),
      months: Number(data.get("months")),`,
      `      name: data.get("name"),
      productData: {name: data.get("productName")},
      months: Number(data.get("months")),`,
    ],
  ],
);

update(
  "public/features/syllabus_subscription/pages/subscription_plan_admin/subscription_plan_admin.css",
  [
    [
      `  grid-template-columns: minmax(180px, 2fr) minmax(100px, 1fr) minmax(120px, 1fr) auto;`,
      `  grid-template-columns: minmax(160px, 2fr) minmax(180px, 2fr) minmax(80px, 1fr) minmax(110px, 1fr) auto;`,
    ],
    [
      `  grid-template-columns: minmax(180px, 2fr) minmax(100px, 1fr) minmax(120px, 1fr) auto;`,
      `  grid-template-columns: minmax(160px, 2fr) minmax(180px, 2fr) minmax(80px, 1fr) minmax(110px, 1fr) auto;`,
    ],
  ],
);

update(
  "functions/features/syllabus_subscription/infrastructure/firestore_subscription_plan_billing_repository.js",
  [[
    `      currency: catalog.currency,
      fee: plan.fee,
      months: plan.months,`,
    `      currency: catalog.currency,
      fee: plan.fee,
      months: plan.months,
      productData: plan.productData ?? {name: plan.name},`,
  ]],
);

update(
  "functions/features/syllabus_subscription/application/get_subscription_plan_billing_terms.js",
  [
    [
      `function normalizeBillingTerms(pricing) {`,
      `function requireProductData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("productData must be an object.");
  }

  const name = String(value.name ?? "").trim();

  if (!name) {
    throw new Error("productData.name is required.");
  }

  return Object.freeze({name});
}

function normalizeBillingTerms(pricing) {`,
    ],
    [
      `    interval: "month",
    intervalCount: requireMonths(pricing.months),`,
      `    interval: "month",
    intervalCount: requireMonths(pricing.months),
    productData: requireProductData(pricing.productData),`,
    ],
  ],
);

update("functions/features/syllabus_subscription/subscription_plan_module.js", [[
  ` *   -> Promise<{amount, currency, interval, intervalCount}|null>`,
  ` *   -> Promise<{amount, currency, interval, intervalCount,
 *      productData: {name}}|null>`,
]]);

update(
  "functions/features/stripe_payment/domain/stripe_subscription.js",
  [
    [
      `function subscriptionPriceLookupKey({
  amount,
  currency,
  interval,
  intervalCount,
}) {
  return [
    "rhx-subscription",
    currency,
    amount,
    interval,
    intervalCount,
  ].join("-");
}`,
      `function requireProductData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("productData must be an object.");
  }

  const name = requireReference(value.name, "productData.name");

  return Object.freeze({name});
}

function subscriptionPriceLookupKey({
  amount,
  currency,
  interval,
  intervalCount,
  productData,
}) {
  const productFingerprint = createHash("sha256")
    .update(productData.name, "utf8")
    .digest("hex")
    .slice(0, 16);

  return [
    "rhx-subscription-v2",
    currency,
    amount,
    interval,
    intervalCount,
    productFingerprint,
  ].join("-");
}`,
    ],
    [
      `    product_data: {
      name: "RHX Subscription",
    },`,
      `    product_data: billingTerms.productData,`,
    ],
    [
      `  const amount = requireAmount(input.amount);
  const currency = requireCurrency(input.currency);`,
      `  const amount = requireAmount(input.amount);
  const currency = requireCurrency(input.currency);
  const productData = requireProductData(input.productData);`,
    ],
    [
      `    interval,
    intervalCount,
  });`,
      `    interval,
    intervalCount,
    productData,
  });`,
    ],
  ],
);

update("functions/features/stripe_payment/stripe_payment_module.js", [[
  ` *   paymentMethodReference, amount, currency, interval, intervalCount,
 *   idempotencyReference})`,
  ` *   paymentMethodReference, amount, currency, interval, intervalCount,
 *   productData, idempotencyReference})`,
]]);
