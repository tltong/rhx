/**
 * Internal application API:
 *
 * getSubscriptionPlanBillingTerms({country, planId})
 *   -> Promise<{stripeProductName, amount, currency, interval,
 *      intervalCount}|null>
 *
 * amount is an integer in the currency's smallest Stripe charge unit.
 */
const {
  GetSubscriptionPlanBillingTerms,
  normalizeBillingTerms,
} = require("./application/get_subscription_plan_billing_terms");
const {
  FirestoreSubscriptionPlanBillingRepository,
} = require(
  "./infrastructure/firestore_subscription_plan_billing_repository"
);

const subscriptionPlanBillingRepository =
  new FirestoreSubscriptionPlanBillingRepository();
const getSubscriptionPlanBillingTermsUseCase =
  new GetSubscriptionPlanBillingTerms(subscriptionPlanBillingRepository);

async function getSubscriptionPlanBillingTerms(input) {
  return getSubscriptionPlanBillingTermsUseCase.execute(input);
}

module.exports = {
  getSubscriptionPlanBillingTerms,
  async listSubscriptionPlanChoices(country) {
    const plans = await subscriptionPlanBillingRepository.listPricing(country);
    return plans.map(plan => {
      const terms = normalizeBillingTerms(plan);
      return {planId: plan.id, name: plan.name || terms.stripeProductName, months: terms.intervalCount, ...terms};
    }).sort((a, b) => a.intervalCount - b.intervalCount || a.amount - b.amount);
  },
};
