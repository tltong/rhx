export class GetStudentSubscription {
  constructor(studentSubscriptionRepository) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute(studentId) {
    return this.studentSubscriptionRepository.getSubscription(studentId);
  }
}
