export class GetSubscriptionPayment {
  constructor(studentSubscriptionRepository) {
    this.studentSubscriptionRepository = studentSubscriptionRepository;
  }

  async execute(studentId, paymentId) {
    return this.studentSubscriptionRepository.getPayment(
      studentId,
      paymentId
    );
  }
}
