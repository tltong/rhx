const {
  SUBSCRIPTION_PLANS_COLLECTION,
  SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION,
} = require("../../../schema/subscription_plans_schema");
const {
  readDocument,
  readCollection,
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
  constructor({readPlanDocument = readDocument, readPlanCollection = readCollection} = {}) {
    super();
    this.readPlanDocument = readPlanDocument;
    this.readPlanCollection = readPlanCollection;
  }

  async listPricing(country) {
    const id = requireIdentifier(country, "country");
    const [catalog, plans] = await Promise.all([
      this.readPlanDocument(SUBSCRIPTION_PLANS_COLLECTION, id),
      this.readPlanCollection(plansCollectionPath(id)),
    ]);
    return catalog ? plans.map(plan => ({...plan, currency: catalog.currency})) : [];
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
