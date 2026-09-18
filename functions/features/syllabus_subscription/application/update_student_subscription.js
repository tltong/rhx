class UpdateStudentSubscription {
  constructor(studentSubscriptionRepository) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute({studentId, ...changes}) {
    const subscription =
      await this.studentSubscriptionRepository.getSubscription(studentId);

    if (!subscription) {
      const error = new Error(
        `Subscription for student ${studentId} was not found.`,
      );
      error.code = "not-found";
      throw error;
    }

    subscription.update(changes);

    return this.studentSubscriptionRepository.saveSubscription(subscription);
  }
}

module.exports = {
  UpdateStudentSubscription,
};
