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

    return this.executeForContext({providerName: paymentConfig.provider, mode: paymentConfig.mode});
  }

  executeForContext({providerName, mode, requestTimeoutMs}) {
    if (!["test", "prod"].includes(mode)) throw new Error("Invalid payment provider mode.");
    if (requestTimeoutMs !== undefined && (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000 || requestTimeoutMs > 60000)) {
      throw new Error("Invalid payment provider request timeout.");
    }
    const providerFactory = this.providerFactories[providerName];

    if (typeof providerFactory !== "function") {
      throw new Error(
        `Unsupported payment provider: ${providerName}.`,
      );
    }

    const paymentProvider = providerFactory({
      mode,
      ...(requestTimeoutMs === undefined ? {} : {requestTimeoutMs}),
    });

    return Object.freeze({
      providerName,
      mode,
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
