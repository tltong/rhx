export class DeleteSubscriptionPlan {
  constructor(subscriptionPlanRepository) {
    this.subscriptionPlanRepository = subscriptionPlanRepository;
  }

  async execute(country, planId) {
    const plan = await this.subscriptionPlanRepository.getPlan(
      country,
      planId
    );

    if (!plan) {
      throw new Error(`Subscription plan ${planId} was not found.`);
    }

    await this.subscriptionPlanRepository.deletePlan(country, planId);

    return plan;
  }
}
