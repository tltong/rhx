import {
  SubscriptionPlanCatalog
} from "../domain/subscription_plan.js?v=20260829-subscription-plans-v1";

export class SetSubscriptionPlanCurrency {
  constructor(subscriptionPlanRepository) {
    this.subscriptionPlanRepository = subscriptionPlanRepository;
  }

  async execute(country, currency) {
    const existingCatalog = await this.subscriptionPlanRepository.getCatalog(
      country
    );
    const catalog = existingCatalog
      ? existingCatalog.setCurrency(currency)
      : new SubscriptionPlanCatalog({ country, currency });

    return this.subscriptionPlanRepository.saveCatalog(catalog);
  }
}
