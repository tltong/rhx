class StudentSubscriptionRepository {
  async getSubscription(studentId) {
    throw new Error("getSubscription() is not implemented.");
  }

  async createSubscription(subscription) {
    throw new Error("createSubscription() is not implemented.");
  }

  async saveSubscription(subscription) {
    throw new Error("saveSubscription() is not implemented.");
  }
}

module.exports = {
  StudentSubscriptionRepository,
};
