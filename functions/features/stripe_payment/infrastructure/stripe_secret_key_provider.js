const {
  paymentModes,
} = require("../../payment/payment_module");
const {
  stripeProdSecretKey,
  stripeTestSecretKey,
} = require("./stripe_secrets");

function requireSecretValue(secretParameter, name) {
  const secretValue = String(secretParameter?.value?.() ?? "").trim();

  if (!secretValue) {
    throw new Error(`${name} is not configured.`);
  }

  return secretValue;
}

class StripeSecretKeyProvider {
  constructor({
    testSecretKey = stripeTestSecretKey,
    prodSecretKey = stripeProdSecretKey,
  } = {}) {
    this.testSecretKey = testSecretKey;
    this.prodSecretKey = prodSecretKey;
  }

  getSecretKey(mode) {
    if (mode === paymentModes.TEST) {
      return requireSecretValue(
        this.testSecretKey,
        "STRIPE_TEST_SECRET_KEY",
      );
    }

    if (mode === paymentModes.PROD) {
      return requireSecretValue(
        this.prodSecretKey,
        "STRIPE_PROD_SECRET_KEY",
      );
    }

    throw new Error(`Unsupported Stripe payment mode: ${mode}.`);
  }
}

module.exports = {
  StripeSecretKeyProvider,
};
