const {
  onRequest,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  createStripePayment,
  stripeTestWebhookSecret,
  stripeTestWebhookSecrets,
} = require("./features/stripe_payment/stripe_payment_module");
const {
  processStripeSetupIntentEvent,
} = require(
  "./features/stripe_payment_customer/stripe_payment_customer_module"
);
const {
  processStripeSubscriptionEvent,
} = require(
  "./features/stripe_payment_subscription/stripe_payment_subscription_module"
);

const WEBHOOK_OPTIONS = Object.freeze({
  region: "us-central1",
  invoker: "public",
  secrets: stripeTestWebhookSecrets,
});

function getStripeSignature(request) {
  const header = typeof request?.get === "function"
    ? request.get("stripe-signature")
    : request?.headers?.["stripe-signature"];

  return String(Array.isArray(header) ? header[0] ?? "" : header ?? "").trim();
}

function constructTestWebhookEvent({payload, signature, webhookSecret}) {
  const stripePayment = createStripePayment({mode: "test"});

  return stripePayment.constructWebhookEvent({
    payload,
    signature,
    webhookSecret,
  });
}

function createStripeTestWebhookHandlers({
  constructWebhookEvent = constructTestWebhookEvent,
  processSetupIntentEvent = processStripeSetupIntentEvent,
  processSubscriptionEvent = processStripeSubscriptionEvent,
  readWebhookSecret = () => stripeTestWebhookSecret.value(),
  eventLogger = logger,
} = {}) {
  async function stripeTestWebhookHandler(request, response) {
    if (String(request?.method ?? "").toUpperCase() !== "POST") {
      response.set("Allow", "POST");
      response.status(405).json({
        received: false,
        message: "Method not allowed.",
      });
      return;
    }

    const signature = getStripeSignature(request);

    if (!signature || !request.rawBody) {
      response.status(400).json({
        received: false,
        message: "Invalid Stripe webhook signature.",
      });
      return;
    }

    let event;

    try {
      event = constructWebhookEvent({
        payload: request.rawBody,
        signature,
        webhookSecret: readWebhookSecret(),
      });
    } catch (error) {
      eventLogger.warn("Stripe test webhook signature verification failed.", {
        errorMessage: error instanceof Error
          ? error.message
          : String(error),
      });
      response.status(400).json({
        received: false,
        message: "Invalid Stripe webhook signature.",
      });
      return;
    }

    try {
      let outcome = await processSetupIntentEvent({
        mode: "test",
        event,
      });

      if (outcome?.handled !== true) {
        outcome = await processSubscriptionEvent({
          mode: "test",
          event,
        });
      }

      eventLogger.info("Stripe test webhook event processed.", {
        eventId: String(event?.id ?? "") || null,
        eventType: String(event?.type ?? "") || null,
        handled: outcome?.handled === true,
      });
      response.status(200).json({
        received: true,
        handled: outcome?.handled === true,
      });
    } catch (error) {
      eventLogger.error("Stripe test webhook event processing failed.", {
        eventId: String(event?.id ?? "") || null,
        eventType: String(event?.type ?? "") || null,
        errorMessage: error instanceof Error
          ? error.message
          : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      response.status(500).json({
        received: false,
        message: "Stripe webhook processing failed.",
      });
    }
  }

  return Object.freeze({stripeTestWebhookHandler});
}

const handlers = createStripeTestWebhookHandlers();
const stripeTestWebhook = onRequest(
  WEBHOOK_OPTIONS,
  handlers.stripeTestWebhookHandler,
);

module.exports = {
  WEBHOOK_OPTIONS,
  constructTestWebhookEvent,
  createStripeTestWebhookHandlers,
  getStripeSignature,
  stripeTestWebhook,
};
