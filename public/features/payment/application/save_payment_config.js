import {
  PaymentConfig
} from "../domain/payment_config.js?v=20261031-renewal-restart-v1";

export class SavePaymentConfig {
  constructor(paymentConfigRepository) {
    this.paymentConfigRepository = paymentConfigRepository;
  }

  async execute(input) {
    const paymentConfig = new PaymentConfig({
      ...input,
      updatedAt: new Date()
    });

    return this.paymentConfigRepository.save(paymentConfig);
  }
}
