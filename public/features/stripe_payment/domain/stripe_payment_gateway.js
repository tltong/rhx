export class StripePaymentGateway {
  async listCustomers() {
    throw new Error("listCustomers() is not implemented.");
  }

  async createCustomer(inputReference, email) {
    throw new Error("createCustomer() is not implemented.");
  }

  async deleteCustomer(customerReference) {
    throw new Error("deleteCustomer() is not implemented.");
  }

  async createSetupIntent(customerReference) {
    throw new Error("createSetupIntent() is not implemented.");
  }

  async createSubscription(input) {
    throw new Error("createSubscription() is not implemented.");
  }

  async getSubscriptionPaymentAction(subscriptionReference) {
    throw new Error(
      "getSubscriptionPaymentAction() is not implemented."
    );
  }

  async getClientConfig() {
    throw new Error("getClientConfig() is not implemented.");
  }

  async retrySubscriptionPayment(input) {
    throw new Error("retrySubscriptionPayment() is not implemented.");
  }

  async getSubscriptionPaymentDetails(input) {
    throw new Error("getSubscriptionPaymentDetails() is not implemented.");
  }

  async updateSubscriptionPaymentMethod(input) {
    throw new Error("updateSubscriptionPaymentMethod() is not implemented.");
  }
}
