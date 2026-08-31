export class GetSubscriptionPlan {
  constructor(subscriptionPlanRepository) {
    this.subscriptionPlanRepository = subscriptionPlanRepository;
  }

  async execute(country, planId) {
    return this.subscriptionPlanRepository.getPlan(country, planId);
  }
}
