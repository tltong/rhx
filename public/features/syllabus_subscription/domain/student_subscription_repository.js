export class StudentSubscriptionRepository {
  async getSubscription(studentId) {
    throw new Error("getSubscription() is not implemented.");
  }

  async createSubscription(subscription) {
    throw new Error("createSubscription() is not implemented.");
  }

  async saveSubscription(subscription) {
    throw new Error("saveSubscription() is not implemented.");
  }

  async getPayment(studentId, paymentId) {
    throw new Error("getPayment() is not implemented.");
  }

  async listPayments(studentId) {
    throw new Error("listPayments() is not implemented.");
  }

  async createPayment(payment) {
    throw new Error("createPayment() is not implemented.");
  }
}
