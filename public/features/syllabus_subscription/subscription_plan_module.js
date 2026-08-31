/**
 * Public APIs:
 *
 * getSubscriptionPlanCatalog(country)
 *   -> Promise<SubscriptionPlanCatalog|null>
 * getSubscriptionPlan(country, planId)
 *   -> Promise<SubscriptionPlan|null>
 * listSubscriptionPlans(country)
 *   -> Promise<SubscriptionPlan[]>
 * setSubscriptionPlanCurrency(country, currency)
 *   -> Promise<SubscriptionPlanCatalog>
 * createSubscriptionPlan({country, name, months, fee})
 *   -> Promise<SubscriptionPlan>
 * updateSubscriptionPlan({country, planId, name?, months?, fee?})
 *   -> Promise<SubscriptionPlan>
 * deleteSubscriptionPlan(country, planId)
 *   -> Promise<SubscriptionPlan>
 */
import {
  CreateSubscriptionPlan
} from "./application/create_subscription_plan.js?v=20260829-subscription-plans-v1";
import {
  DeleteSubscriptionPlan
} from "./application/delete_subscription_plan.js?v=20260829-subscription-plans-v1";
import {
  GetSubscriptionPlan
} from "./application/get_subscription_plan.js?v=20260829-subscription-plans-v1";
import {
  GetSubscriptionPlanCatalog
} from "./application/get_subscription_plan_catalog.js?v=20260829-subscription-plans-v1";
import {
  ListSubscriptionPlans
} from "./application/list_subscription_plans.js?v=20260829-subscription-plans-v1";
import {
  SetSubscriptionPlanCurrency
} from "./application/set_subscription_plan_currency.js?v=20260829-subscription-plans-v1";
import {
  UpdateSubscriptionPlan
} from "./application/update_subscription_plan.js?v=20260829-subscription-plans-v1";
import {
  FirestoreSubscriptionPlanRepository
} from "./infrastructure/firestore_subscription_plan_repository.js?v=20260829-subscription-plans-v1";

const subscriptionPlanRepository =
  new FirestoreSubscriptionPlanRepository();
const getSubscriptionPlanCatalogUseCase =
  new GetSubscriptionPlanCatalog(subscriptionPlanRepository);
const getSubscriptionPlanUseCase =
  new GetSubscriptionPlan(subscriptionPlanRepository);
const listSubscriptionPlansUseCase =
  new ListSubscriptionPlans(subscriptionPlanRepository);
const setSubscriptionPlanCurrencyUseCase =
  new SetSubscriptionPlanCurrency(subscriptionPlanRepository);
const createSubscriptionPlanUseCase =
  new CreateSubscriptionPlan(subscriptionPlanRepository);
const updateSubscriptionPlanUseCase =
  new UpdateSubscriptionPlan(subscriptionPlanRepository);
const deleteSubscriptionPlanUseCase =
  new DeleteSubscriptionPlan(subscriptionPlanRepository);

async function getSubscriptionPlanCatalog(country) {
  return getSubscriptionPlanCatalogUseCase.execute(country);
}

async function getSubscriptionPlan(country, planId) {
  return getSubscriptionPlanUseCase.execute(country, planId);
}

async function listSubscriptionPlans(country) {
  return listSubscriptionPlansUseCase.execute(country);
}

async function setSubscriptionPlanCurrency(country, currency) {
  return setSubscriptionPlanCurrencyUseCase.execute(country, currency);
}

async function createSubscriptionPlan(input) {
  return createSubscriptionPlanUseCase.execute(input);
}

async function updateSubscriptionPlan(input) {
  return updateSubscriptionPlanUseCase.execute(input);
}

async function deleteSubscriptionPlan(country, planId) {
  return deleteSubscriptionPlanUseCase.execute(country, planId);
}

export {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionPlan,
  getSubscriptionPlanCatalog,
  listSubscriptionPlans,
  setSubscriptionPlanCurrency,
  updateSubscriptionPlan
};
