export class UpdateStudentSubscription {
  constructor(studentSubscriptionRepository) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute({ studentId, ...changes }) {
    const subscription =
      await this.studentSubscriptionRepository.getSubscription(studentId);

    if (!subscription) {
      throw new Error(`Subscription for student ${studentId} was not found.`);
    }

    subscription.update(changes);

    return this.studentSubscriptionRepository.saveSubscription(subscription);
  }
}
