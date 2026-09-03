const {
  defineSecret,
} = require("firebase-functions/params");

const stripeTestSecretKey = defineSecret(
  "STRIPE_TEST_SECRET_KEY",
);
const stripeProdSecretKey = defineSecret(
  "STRIPE_PROD_SECRET_KEY",
);

const stripeSecretKeys = Object.freeze([
  stripeTestSecretKey,
  stripeProdSecretKey,
]);

module.exports = {
  stripeProdSecretKey,
  stripeSecretKeys,
  stripeTestSecretKey,
};
