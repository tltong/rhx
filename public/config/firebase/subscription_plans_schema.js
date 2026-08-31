export const SUBSCRIPTION_PLANS_COLLECTION = "subscription_plans";
export const SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION = "plans";

export const subscriptionPlanCountryDocumentIdPattern = "[country]";
export const subscriptionPlanDocumentIdPattern = "[auto_generated_id]";

export const subscriptionPlansSchema = {
  collection: SUBSCRIPTION_PLANS_COLLECTION,
  documentId: subscriptionPlanCountryDocumentIdPattern,
  fields: {
    currency: "string"
  },
  subcollections: {
    plans: {
      collection: SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION,
      documentId: subscriptionPlanDocumentIdPattern,
      fields: {
        name: "string",
        months: "number",
        fee: "number"
      }
    }
  }
};

export default {
  SUBSCRIPTION_PLANS_COLLECTION,
  SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION,
  subscriptionPlanCountryDocumentIdPattern,
  subscriptionPlanDocumentIdPattern,
  subscriptionPlansSchema
};
