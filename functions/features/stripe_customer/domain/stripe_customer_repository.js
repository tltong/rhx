class StripeCustomerRepository {
  async createCustomer(_record) {
    throw new Error("createCustomer() is not implemented.");
  }

  async getCustomerByReference(_mode, _customerReference) {
    throw new Error("getCustomerByReference() is not implemented.");
  }

  async getCustomerByInternalReference(_mode, _internalReference) {
    throw new Error(
      "getCustomerByInternalReference() is not implemented.",
    );
  }

  async updateCustomer(_record, _previousInternalReference) {
    throw new Error("updateCustomer() is not implemented.");
  }

  async replaceCustomer(_staleCustomerReference, _record) {
    throw new Error("replaceCustomer() is not implemented.");
  }

  async deleteCustomer(_mode, _customerReference) {
    throw new Error("deleteCustomer() is not implemented.");
  }

  async writeSetupIntent(_record) {
    throw new Error("writeSetupIntent() is not implemented.");
  }

  async getSetupIntent(_input) {
    throw new Error("getSetupIntent() is not implemented.");
  }

  async listSetupIntents(_input) {
    throw new Error("listSetupIntents() is not implemented.");
  }

  async deleteSetupIntent(_input) {
    throw new Error("deleteSetupIntent() is not implemented.");
  }

  async writePaymentMethod(_record) {
    throw new Error("writePaymentMethod() is not implemented.");
  }

  async getPaymentMethod(_input) {
    throw new Error("getPaymentMethod() is not implemented.");
  }

  async listPaymentMethods(_input) {
    throw new Error("listPaymentMethods() is not implemented.");
  }

  async deletePaymentMethod(_input) {
    throw new Error("deletePaymentMethod() is not implemented.");
  }

  async writeSubscription(_record) {
    throw new Error("writeSubscription() is not implemented.");
  }

  async getSubscription(_input) {
    throw new Error("getSubscription() is not implemented.");
  }

  async listSubscriptions(_input) {
    throw new Error("listSubscriptions() is not implemented.");
  }

  async deleteSubscription(_input) {
    throw new Error("deleteSubscription() is not implemented.");
  }
}

module.exports = {
  StripeCustomerRepository,
};
