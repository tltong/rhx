export class ListSubscriptionPayments {
  constructor(studentSubscriptionRepository) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute(studentId) {
    return this.studentSubscriptionRepository.listPayments(studentId);
  }
}
