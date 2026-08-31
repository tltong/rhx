import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateSubscriptionPlan
} from "./application/create_subscription_plan.js";
import {
  DeleteSubscriptionPlan
} from "./application/delete_subscription_plan.js";
import {
  SetSubscriptionPlanCurrency
} from "./application/set_subscription_plan_currency.js";
import {
  UpdateSubscriptionPlan
} from "./application/update_subscription_plan.js";
import {
  SubscriptionPlan,
  SubscriptionPlanCatalog
} from "./domain/subscription_plan.js";
import * as subscriptionPlanModule from "./subscription_plan_module.js";

class MemorySubscriptionPlanRepository {
  constructor() {
    this.catalogs = new Map();
    this.plans = new Map();
    this.nextId = 1;
  }

  getPlanMap(country) {
    if (!this.plans.has(country)) {
      this.plans.set(country, new Map());
    }

    return this.plans.get(country);
  }

  async getCatalog(country) {
    const catalog = this.catalogs.get(country) || null;

    if (!catalog) {
      return null;
    }

    return new SubscriptionPlanCatalog({
      country: catalog.country,
      currency: catalog.currency,
      plans: [...this.getPlanMap(country).values()]
    });
  }

  async getPlan(country, planId) {
    return this.getPlanMap(country).get(planId) || null;
  }

  async saveCatalog(catalog) {
    this.catalogs.set(catalog.country, catalog);

    return this.getCatalog(catalog.country);
  }

  async createPlan(plan) {
    plan.id = `plan_${this.nextId++}`;
    this.getPlanMap(plan.country).set(plan.id, plan);

    return plan;
  }

  async savePlan(plan) {
    this.getPlanMap(plan.country).set(plan.id, plan);

    return plan;
  }

  async deletePlan(country, planId) {
    this.getPlanMap(country).delete(planId);

    return planId;
  }
}

test("subscription plan module exposes the complete public API", () => {
  [
    "getSubscriptionPlanCatalog",
    "getSubscriptionPlan",
    "listSubscriptionPlans",
    "setSubscriptionPlanCurrency",
    "createSubscriptionPlan",
    "updateSubscriptionPlan",
    "deleteSubscriptionPlan"
  ].forEach((apiName) => {
    assert.equal(typeof subscriptionPlanModule[apiName], "function");
  });
});

test("subscription plan validates months and fee", () => {
  assert.throws(() => new SubscriptionPlan({
    country: "Malaysia",
    name: "Invalid months",
    months: 0,
    fee: 10
  }), /months must be a positive integer/);

  assert.throws(() => new SubscriptionPlan({
    country: "Malaysia",
    name: "Invalid fee",
    months: 1,
    fee: -1
  }), /fee must be a non-negative number/);
});

test("plan creation requires currency and receives a generated ID", async () => {
  const repository = new MemorySubscriptionPlanRepository();
  const setCurrency = new SetSubscriptionPlanCurrency(repository);
  const createPlan = new CreateSubscriptionPlan(repository);
  const input = {
    country: "Malaysia",
    name: "Quarterly",
    months: 3,
    fee: 59.9
  };

  await assert.rejects(
    createPlan.execute(input),
    /Configure the subscription currency/
  );

  const catalog = await setCurrency.execute("Malaysia", "MYR");
  const plan = await createPlan.execute(input);

  assert.equal(catalog.currency, "MYR");
  assert.equal(plan.id, "plan_1");
  assert.equal(plan.months, 3);
  assert.equal(plan.fee, 59.9);
});

test("plan update and delete return the affected plan", async () => {
  const repository = new MemorySubscriptionPlanRepository();
  const setCurrency = new SetSubscriptionPlanCurrency(repository);
  const createPlan = new CreateSubscriptionPlan(repository);
  const updatePlan = new UpdateSubscriptionPlan(repository);
  const deletePlan = new DeleteSubscriptionPlan(repository);

  await setCurrency.execute("Singapore", "SGD");
  const created = await createPlan.execute({
    country: "Singapore",
    name: "Monthly",
    months: 1,
    fee: 20
  });
  const updated = await updatePlan.execute({
    country: "Singapore",
    planId: created.id,
    name: "Monthly Plus",
    fee: 25
  });
  const deleted = await deletePlan.execute("Singapore", created.id);

  assert.equal(updated.name, "Monthly Plus");
  assert.equal(updated.months, 1);
  assert.equal(updated.fee, 25);
  assert.equal(deleted.id, created.id);
  assert.equal(
    await repository.getPlan("Singapore", created.id),
    null
  );
});
