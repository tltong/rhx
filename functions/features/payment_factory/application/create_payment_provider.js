class CreatePaymentProvider {
  constructor({ getPaymentConfig, providerFactories }) {
    this.getPaymentConfig = getPaymentConfig;
    this.providerFactories = providerFactories;
  }

  async executeWithContext() {
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

    const paymentProvider = providerFactory({
      mode: paymentConfig.mode,
    });

    return Object.freeze({
      providerName: paymentConfig.provider,
      mode: paymentConfig.mode,
      paymentProvider,
    });
  }

  async execute() {
    const context = await this.executeWithContext();

    return context.paymentProvider;
  }
}

module.exports = {
  CreatePaymentProvider,
};
