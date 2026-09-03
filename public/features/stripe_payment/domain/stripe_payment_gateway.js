export class StripePaymentGateway {
  async createCustomer(inputReference) {
    throw new Error("createCustomer() is not implemented.");
  }

  async deleteCustomer(customerReference) {
    throw new Error("deleteCustomer() is not implemented.");
  }

  async createSetupIntent(customerReference) {
    throw new Error("createSetupIntent() is not implemented.");
  }
}
