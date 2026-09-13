const SUBSCRIPTION_PLANS_COLLECTION = "subscription_plans";
const SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION = "plans";

const subscriptionPlanCountryDocumentIdPattern = "[country]";
const subscriptionPlanDocumentIdPattern = "[auto_generated_id]";

const subscriptionPlansSchema = {
  collection: SUBSCRIPTION_PLANS_COLLECTION,
  documentId: subscriptionPlanCountryDocumentIdPattern,
  fields: {
    currency: "string",
  },
  subcollections: {
    plans: {
      collection: SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION,
      documentId: subscriptionPlanDocumentIdPattern,
      fields: {
        name: "string",
        stripeProductName: "string",
        months: "number",
        fee: "number",
      },
    },
  },
};

module.exports = {
  SUBSCRIPTION_PLANS_COLLECTION,
  SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION,
  subscriptionPlanCountryDocumentIdPattern,
  subscriptionPlanDocumentIdPattern,
  subscriptionPlansSchema,
};
