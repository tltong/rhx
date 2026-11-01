const Stripe = require("stripe");
const {
  StripePayment,
} = require("../domain/stripe_payment");
const {
  StripeSecretKeyProvider,
} = require("./stripe_secret_key_provider");

class StripePaymentFactory {
  constructor({
    StripeConstructor = Stripe,
    secretKeyProvider = new StripeSecretKeyProvider(),
  } = {}) {
    this.StripeConstructor = StripeConstructor;
    this.secretKeyProvider = secretKeyProvider;
  }

  create({mode, requestTimeoutMs}) {
    const secretKey = this.secretKeyProvider.getSecretKey(mode);
    const stripeClient = requestTimeoutMs === undefined ? new this.StripeConstructor(secretKey)
      : new this.StripeConstructor(secretKey, {timeout: requestTimeoutMs, maxNetworkRetries: 0});

    return new StripePayment(stripeClient);
  }
}

module.exports = {
  StripePaymentFactory,
};
