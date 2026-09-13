class SubscriptionPlanBillingRepository {
  async getPricing(_country, _planId) {
    throw new Error("getPricing() is not implemented.");
  }
}

module.exports = {
  SubscriptionPlanBillingRepository,
};
