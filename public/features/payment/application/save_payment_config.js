import {
  PaymentConfig
} from "../domain/payment_config.js?v=20260901-payment-config-simple-v1";

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
