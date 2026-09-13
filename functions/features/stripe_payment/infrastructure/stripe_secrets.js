const {
  defineSecret,
} = require("firebase-functions/params");

const stripeTestSecretKey = defineSecret(
  "STRIPE_TEST_SECRET_KEY",
);
const stripeProdSecretKey = defineSecret(
  "STRIPE_PROD_SECRET_KEY",
);
const stripeTestPublishableKey = defineSecret(
  "STRIPE_TEST_PUBLISHABLE_KEY",
);
const stripeProdPublishableKey = defineSecret(
  "STRIPE_PROD_PUBLISHABLE_KEY",
);
const stripeTestWebhookSecret = defineSecret(
  "STRIPE_TEST_WEBHOOK_SECRET",
);
const stripeProdWebhookSecret = defineSecret(
  "STRIPE_PROD_WEBHOOK_SECRET",
);

const stripeSecretKeys = Object.freeze([
  stripeTestSecretKey,
  stripeProdSecretKey,
]);
const stripePublishableKeys = Object.freeze([
  stripeTestPublishableKey,
  stripeProdPublishableKey,
]);
const stripeTestWebhookSecrets = Object.freeze([
  stripeTestSecretKey,
  stripeTestWebhookSecret,
]);
const stripeProdWebhookSecrets = Object.freeze([
  stripeProdSecretKey,
  stripeProdWebhookSecret,
]);

module.exports = {
  stripeProdPublishableKey,
  stripeProdSecretKey,
  stripeProdWebhookSecret,
  stripeProdWebhookSecrets,
  stripePublishableKeys,
  stripeSecretKeys,
  stripeTestPublishableKey,
  stripeTestSecretKey,
  stripeTestWebhookSecret,
  stripeTestWebhookSecrets,
};
