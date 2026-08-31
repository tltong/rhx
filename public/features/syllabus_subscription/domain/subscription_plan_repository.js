export class SubscriptionPlanRepository {
  async getCatalog(country) {
    throw new Error("getCatalog() is not implemented.");
  }

  async getPlan(country, planId) {
    throw new Error("getPlan() is not implemented.");
  }

  async listPlans(country) {
    throw new Error("listPlans() is not implemented.");
  }

  async saveCatalog(catalog) {
    throw new Error("saveCatalog() is not implemented.");
  }

  async createPlan(plan) {
    throw new Error("createPlan() is not implemented.");
  }

  async savePlan(plan) {
    throw new Error("savePlan() is not implemented.");
  }

  async deletePlan(country, planId) {
    throw new Error("deletePlan() is not implemented.");
  }
}
