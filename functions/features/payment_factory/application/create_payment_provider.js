class CreatePaymentProvider {
  constructor({ getPaymentConfig, providerFactories }) {
    this.getPaymentConfig = getPaymentConfig;
    this.providerFactories = providerFactories;
  }

  async execute() {
    const paymentConfig = await this.getPaymentConfig();

    if (!paymentConfig) {
      throw new Error("Payment configuration is not available.");
    }

    const providerFactory = this.providerFactories[paymentConfig.provider];

    if (typeof providerFactory !== "function") {
      throw new Error(
        `Unsupported payment provider: ${paymentConfig.provider}.`,
      );
    }

    return providerFactory({
      mode: paymentConfig.mode,
    });
  }
}

module.exports = {
  CreatePaymentProvider,
};
