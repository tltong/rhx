export class GetSubscriptionPlanCatalog {
  constructor(subscriptionPlanRepository) {
    this.subscriptionPlanRepository = subscriptionPlanRepository;
  }

  async execute(country) {
    return this.subscriptionPlanRepository.getCatalog(country);
  }
}
