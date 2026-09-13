const STRIPE_SETUP_INTENT_EVENT_TYPES = Object.freeze({
  SUCCEEDED: "setup_intent.succeeded",
  SETUP_FAILED: "setup_intent.setup_failed",
  CANCELED: "setup_intent.canceled",
});

const SUPPORTED_EVENT_TYPES = new Set(
  Object.values(STRIPE_SETUP_INTENT_EVENT_TYPES),
);

function requireMode(value) {
  const mode = String(value ?? "").trim().toLowerCase();

  if (mode !== "test" && mode !== "prod") {
    throw new Error("mode must be test or prod.");
  }

  return mode;
}

function requireEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A Stripe event is required.");
  }

  const eventType = String(value.type ?? "").trim();

  if (!eventType) {
    throw new Error("Stripe event type is required.");
  }

  return {event: value, eventType};
}

function stripeReference(value, fieldName, {required = true} = {}) {
  const reference = String(
    value && typeof value === "object" ? value.id ?? "" : value ?? "",
  ).trim();

  if (required && !reference) {
    throw new Error(`Stripe SetupIntent ${fieldName} is required.`);
  }

  return reference || null;
}

function normalizeSetupIntentEvent(eventType, event) {
  const setupIntent = event?.data?.object;

  if (
    !setupIntent
    || typeof setupIntent !== "object"
    || Array.isArray(setupIntent)
    || setupIntent.object !== "setup_intent"
  ) {
    throw new Error("Stripe event must contain a SetupIntent object.");
  }

  const status = String(setupIntent.status ?? "").trim();
  const usage = String(setupIntent.usage ?? "").trim();
  const paymentMethodReference = stripeReference(
    setupIntent.payment_method,
    "payment method reference",
    {required: eventType === STRIPE_SETUP_INTENT_EVENT_TYPES.SUCCEEDED},
  );

  if (!status) {
    throw new Error("Stripe SetupIntent status is required.");
  }

  if (!usage) {
    throw new Error("Stripe SetupIntent usage is required.");
  }

  return Object.freeze({
    customerReference: stripeReference(
      setupIntent.customer,
      "customer reference",
    ),
    setupIntentReference: stripeReference(setupIntent.id, "reference"),
    status,
    usage,
    paymentMethodReference,
  });
}

class ProcessStripeSetupIntentEvent {
  constructor({
    createStripePayment,
    getCustomerRecordByReference,
    writeSetupIntentRecord,
    writePaymentMethodRecord,
  }) {
    this.createStripePayment = createStripePayment;
    this.getCustomerRecordByReference = getCustomerRecordByReference;
    this.writeSetupIntentRecord = writeSetupIntentRecord;
    this.writePaymentMethodRecord = writePaymentMethodRecord;
  }

  async execute({mode: inputMode, event: inputEvent} = {}) {
    const mode = requireMode(inputMode);
    const {event, eventType} = requireEvent(inputEvent);

    if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
      return Object.freeze({handled: false, eventType});
    }

    const setupIntent = normalizeSetupIntentEvent(eventType, event);
    const customerRecord = await this.getCustomerRecordByReference({
      mode,
      customerReference: setupIntent.customerReference,
    });

    if (!customerRecord) {
      throw new Error(
        `Stripe customer ${setupIntent.customerReference} is not registered ` +
        `in ${mode} mode.`,
      );
    }

    let paymentMethod = null;

    if (eventType === STRIPE_SETUP_INTENT_EVENT_TYPES.SUCCEEDED) {
      const stripePayment = this.createStripePayment({mode});

      if (typeof stripePayment?.retrievePaymentMethod !== "function") {
        throw new Error(
          "The Stripe payment provider cannot retrieve PaymentMethods.",
        );
      }

      paymentMethod = await stripePayment.retrievePaymentMethod(
        setupIntent.paymentMethodReference,
      );

      if (
        paymentMethod.customerReference
        && paymentMethod.customerReference !== setupIntent.customerReference
      ) {
        throw new Error(
          "Stripe PaymentMethod customer does not match the SetupIntent customer.",
        );
      }
    }

    await this.writeSetupIntentRecord({
      mode,
      customerReference: setupIntent.customerReference,
      setupIntentReference: setupIntent.setupIntentReference,
      status: setupIntent.status,
      usage: setupIntent.usage,
      paymentMethodReference: setupIntent.paymentMethodReference,
    });

    if (paymentMethod) {
      await this.writePaymentMethodRecord({
        mode,
        customerReference: setupIntent.customerReference,
        paymentMethodReference: paymentMethod.paymentMethodReference,
        setupIntentReference: setupIntent.setupIntentReference,
        type: paymentMethod.type,
        status: "active",
        card: paymentMethod.card,
      });
    }

    return Object.freeze({
      handled: true,
      eventType,
      mode,
      customerReference: setupIntent.customerReference,
      setupIntentReference: setupIntent.setupIntentReference,
      status: setupIntent.status,
      paymentMethodReference: setupIntent.paymentMethodReference,
    });
  }
}

module.exports = {
  ProcessStripeSetupIntentEvent,
  STRIPE_SETUP_INTENT_EVENT_TYPES,
  normalizeSetupIntentEvent,
};
