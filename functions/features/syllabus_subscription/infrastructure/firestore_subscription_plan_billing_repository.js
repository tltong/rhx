const {
  SUBSCRIPTION_PLANS_COLLECTION,
  SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION,
} = require("../../../schema/subscription_plans_schema");
const {
  readDocument,
} = require("../../../utils/firebase/firebase_ops");
const {
  SubscriptionPlanBillingRepository,
} = require("../domain/subscription_plan_billing_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  if (identifier.includes("/")) {
    throw new Error(`${fieldName} must not contain a slash.`);
  }

  return identifier;
}

function plansCollectionPath(country) {
  return [
    SUBSCRIPTION_PLANS_COLLECTION,
    country,
    SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION,
  ].join("/");
}

class FirestoreSubscriptionPlanBillingRepository
  extends SubscriptionPlanBillingRepository {
  constructor({readPlanDocument = readDocument} = {}) {
    super();
    this.readPlanDocument = readPlanDocument;
  }

  async getPricing(country, planId) {
    const normalizedCountry = requireIdentifier(country, "country");
    const normalizedPlanId = requireIdentifier(planId, "planId");
    const [catalog, plan] = await Promise.all([
      this.readPlanDocument(
        SUBSCRIPTION_PLANS_COLLECTION,
        normalizedCountry,
      ),
      this.readPlanDocument(
        plansCollectionPath(normalizedCountry),
        normalizedPlanId,
      ),
    ]);

    if (!catalog || !plan) {
      return null;
    }

    return Object.freeze({
      currency: catalog.currency,
      fee: plan.fee,
      months: plan.months,
      stripeProductName: plan.stripeProductName,
    });
  }
}

module.exports = {
  FirestoreSubscriptionPlanBillingRepository,
};
