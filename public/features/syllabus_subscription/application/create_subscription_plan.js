import {
  SubscriptionPlan
} from "../domain/subscription_plan.js?v=20260912-stripe-product-name-v1";

export class CreateSubscriptionPlan {
  constructor(subscriptionPlanRepository) {
    this.subscriptionPlanRepository = subscriptionPlanRepository;
  }

  async execute(input) {
    const plan = new SubscriptionPlan(input);
    const catalog = await this.subscriptionPlanRepository.getCatalog(
      plan.country
    );

    if (!catalog) {
      throw new Error(
        `Configure the subscription currency for ${plan.country} first.`
      );
    }

    return this.subscriptionPlanRepository.createPlan(plan);
  }
}
