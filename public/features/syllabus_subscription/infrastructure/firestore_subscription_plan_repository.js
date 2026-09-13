import {
  SUBSCRIPTION_PLANS_COLLECTION,
  SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION
} from "../../../config/firebase/subscription_plans_schema.js?v=20260912-stripe-product-name-v1";
import {
  createDocument,
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  normalizeSubscriptionPlanCountry,
  SubscriptionPlan,
  SubscriptionPlanCatalog
} from "../domain/subscription_plan.js?v=20260912-stripe-product-name-v1";
import {
  SubscriptionPlanRepository
} from "../domain/subscription_plan_repository.js";

function normalizePlanId(planId) {
  const normalizedPlanId = String(planId ?? "").trim();

  if (!normalizedPlanId) {
    throw new Error("planId is required.");
  }

  return normalizedPlanId;
}

function getPlansCollectionPath(country) {
  return [
    SUBSCRIPTION_PLANS_COLLECTION,
    normalizeSubscriptionPlanCountry(country),
    SUBSCRIPTION_PLAN_ITEMS_SUBCOLLECTION
  ].join("/");
}

function toSubscriptionPlan(country, data) {
  if (!data) {
    return null;
  }

  return new SubscriptionPlan({
    id: data.id,
    country,
    name: data.name,
    stripeProductName:
      data.stripeProductName ?? data.productData?.name ?? data.name,
    months: data.months,
    fee: data.fee
  });
}

function toPlanRecord(plan) {
  return {
    name: plan.name,
    stripeProductName: plan.stripeProductName,
    months: plan.months,
    fee: plan.fee
  };
}

export class FirestoreSubscriptionPlanRepository
  extends SubscriptionPlanRepository {
  constructor({
    createPlanDocument = createDocument,
    deletePlanDocument = deleteDocument,
    readPlanCollection = readCollection,
    readPlanDocument = readDocument,
    writePlanDocument = writeDocument
  } = {}) {
    super();
    this.createPlanDocument = createPlanDocument;
    this.deletePlanDocument = deletePlanDocument;
    this.readPlanCollection = readPlanCollection;
    this.readPlanDocument = readPlanDocument;
    this.writePlanDocument = writePlanDocument;
  }

  async getCatalog(country) {
    const normalizedCountry = normalizeSubscriptionPlanCountry(country);
    const data = await this.readPlanDocument(
      SUBSCRIPTION_PLANS_COLLECTION,
      normalizedCountry
    );

    if (!data) {
      return null;
    }

    return new SubscriptionPlanCatalog({
      country: normalizedCountry,
      currency: data.currency,
      plans: await this.listPlans(normalizedCountry)
    });
  }

  async getPlan(country, planId) {
    const normalizedCountry = normalizeSubscriptionPlanCountry(country);
    const data = await this.readPlanDocument(
      getPlansCollectionPath(normalizedCountry),
      normalizePlanId(planId)
    );

    return toSubscriptionPlan(normalizedCountry, data);
  }

  async listPlans(country) {
    const normalizedCountry = normalizeSubscriptionPlanCountry(country);
    const records = await this.readPlanCollection(
      getPlansCollectionPath(normalizedCountry)
    );

    return records
      .map((record) => toSubscriptionPlan(normalizedCountry, record))
      .sort((first, second) => (
        first.months - second.months
        || first.fee - second.fee
        || first.name.localeCompare(second.name)
      ));
  }

  async saveCatalog(catalog) {
    await this.writePlanDocument(
      SUBSCRIPTION_PLANS_COLLECTION,
      catalog.country,
      { currency: catalog.currency },
      { merge: false }
    );

    return this.getCatalog(catalog.country);
  }

  async createPlan(plan) {
    const result = await this.createPlanDocument(
      getPlansCollectionPath(plan.country),
      toPlanRecord(plan)
    );

    plan.id = result.id;

    return plan;
  }

  async savePlan(plan) {
    const planId = normalizePlanId(plan.id);

    await this.writePlanDocument(
      getPlansCollectionPath(plan.country),
      planId,
      toPlanRecord(plan),
      { merge: false }
    );

    return plan;
  }

  async deletePlan(country, planId) {
    const normalizedCountry = normalizeSubscriptionPlanCountry(country);
    const normalizedPlanId = normalizePlanId(planId);

    await this.deletePlanDocument(
      getPlansCollectionPath(normalizedCountry),
      normalizedPlanId
    );

    return normalizedPlanId;
  }
}
