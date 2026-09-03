export class GetPaymentConfig {
  constructor(paymentConfigRepository) {
    this.paymentConfigRepository = paymentConfigRepository;
  }

  async execute() {
    return this.paymentConfigRepository.get();
  }
}
