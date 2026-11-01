export class StripeSubscriptionPaymentGateway {
  async manageRenewalRecovery(_input) {throw Error("manageRenewalRecovery() is not implemented.");}
  async getGuardianSubscriptionOptions(_input) {throw Error("getGuardianSubscriptionOptions() is not implemented.");}
  async prepareStudentSubscription(_input) {throw Error("prepareStudentSubscription() is not implemented.");}
  async createStudentSubscription(_input) {throw Error("createStudentSubscription() is not implemented.");}
  async changeStudentSubscriptionPlan(_input) {throw Error("changeStudentSubscriptionPlan() is not implemented.");}
  async getSubscriptionPaymentDetails(input) {
    throw new Error("getSubscriptionPaymentDetails() is not implemented.");
  }
  async getSubscriptionPaymentAction(input) {
    throw new Error("getSubscriptionPaymentAction() is not implemented.");
  }
  async retrySubscriptionPayment(input) {
    throw new Error("retrySubscriptionPayment() is not implemented.");
  }
  async createSubscriptionCardSetup(input) {
    throw new Error("createSubscriptionCardSetup() is not implemented.");
  }
  async updateSubscriptionPaymentMethod(input) {
    throw new Error("updateSubscriptionPaymentMethod() is not implemented.");
  }
}
