const {createHash} = require("node:crypto");

function key(prefix, value) {
  return prefix + createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function reference(value) {
  return typeof value === "object" ? value?.id || null : value || null;
}

async function retrieveStripeSetupIntent(client, setupIntentReference) {
  const intent = await client.setupIntents.retrieve(setupIntentReference);
  if (intent.id !== setupIntentReference) throw Error("Unexpected Stripe SetupIntent.");
  return {setupIntentReference: intent.id, customerReference: reference(intent.customer),
    status: intent.status, usage: intent.usage, paymentMethodReference: reference(intent.payment_method),
    metadata: {...intent.metadata}, createdAt: new Date(intent.created * 1000)};
}

async function updateStripeSubscriptionPaymentMethod(client, input) {
  const result = await client.subscriptions.update(input.subscriptionReference, {
    default_payment_method: input.paymentMethodReference,
    payment_settings: {save_default_payment_method: "on_subscription"},
  }, {idempotencyKey: key("subscription-card-", [input.subscriptionReference, input.setupIntentReference])});
  if (result.id !== input.subscriptionReference) throw Error("Unexpected Stripe subscription.");
  // Lazy import avoids the shared idempotency-key helper forming a module cycle.
  if (result.schedule) await require("./stripe_subscription_plan_change").updateManagedScheduleCard(client, result, input);
  return {subscriptionReference: result.id};
}

module.exports = {retrieveStripeSetupIntent, updateStripeSubscriptionPaymentMethod, key};
