const {
  paymentModes,
} = require("../../payment/payment_module");
const {
  stripeProdPublishableKey,
  stripeTestPublishableKey,
} = require("./stripe_secrets");

function requirePublishableKey(secretParameter, name, prefix) {
  const value = String(secretParameter?.value?.() ?? "").trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  if (!value.startsWith(prefix)) {
    throw new Error(`${name} is not a valid Stripe publishable key.`);
  }

  return value;
}

class StripePublishableKeyProvider {
  constructor({
    testPublishableKey = stripeTestPublishableKey,
    prodPublishableKey = stripeProdPublishableKey,
  } = {}) {
    this.testPublishableKey = testPublishableKey;
    this.prodPublishableKey = prodPublishableKey;
  }

  getPublishableKey(mode) {
    if (mode === paymentModes.TEST) {
      return requirePublishableKey(
        this.testPublishableKey,
        "STRIPE_TEST_PUBLISHABLE_KEY",
        "pk_test_",
      );
    }

    if (mode === paymentModes.PROD) {
      return requirePublishableKey(
        this.prodPublishableKey,
        "STRIPE_PROD_PUBLISHABLE_KEY",
        "pk_live_",
      );
    }

    throw new Error(`Unsupported Stripe payment mode: ${mode}.`);
  }
}

module.exports = {
  StripePublishableKeyProvider,
};
