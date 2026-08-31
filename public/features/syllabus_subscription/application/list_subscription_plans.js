export class ListSubscriptionPlans {
  constructor(subscriptionPlanRepository) {
    this.subscriptionPlanRepository = subscriptionPlanRepository;
  }

  async execute(country) {
    return this.subscriptionPlanRepository.listPlans(country);
  }
}
