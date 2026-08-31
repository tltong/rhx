export class UpdateSubscriptionPlan {
  constructor(subscriptionPlanRepository) {
    this.subscriptionPlanRepository = subscriptionPlanRepository;
  }

  async execute({ country, planId, ...changes }) {
    const plan = await this.subscriptionPlanRepository.getPlan(
      country,
      planId
    );

    if (!plan) {
      throw new Error(`Subscription plan ${planId} was not found.`);
    }

    plan.update(changes);

    return this.subscriptionPlanRepository.savePlan(plan);
  }
}
