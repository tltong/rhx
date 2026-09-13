const STRIPE_SUBSCRIPTION_EVENT_TYPES = Object.freeze({
  INVOICE_PAID: "invoice.paid",
  INVOICE_PAYMENT_ACTION_REQUIRED: "invoice.payment_action_required",
});

const SUPPORTED_EVENT_TYPES = new Set(
  Object.values(STRIPE_SUBSCRIPTION_EVENT_TYPES),
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
    throw new Error(`Stripe ${fieldName} is required.`);
  }

  return reference || null;
}

function invoiceSubscriptionReference(invoice) {
  return invoice?.parent?.subscription_details?.subscription
    ?? invoice?.subscription
    ?? null;
}

function normalizeInvoiceEvent(event) {
  const invoice = event?.data?.object;

  if (
    !invoice
    || typeof invoice !== "object"
    || Array.isArray(invoice)
    || invoice.object !== "invoice"
  ) {
    throw new Error("Stripe event must contain an Invoice object.");
  }

  return Object.freeze({
    invoiceReference: stripeReference(invoice.id, "Invoice reference"),
    customerReference: stripeReference(
      invoice.customer,
      "Invoice customer reference",
    ),
    subscriptionReference: stripeReference(
      invoiceSubscriptionReference(invoice),
      "Invoice subscription reference",
      {required: false},
    ),
  });
}

function requireSubscriptionResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "The Stripe payment provider did not return Subscription details.",
    );
  }

  return value;
}

function requirePaymentContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "The Stripe payment provider did not return Invoice payment context.",
    );
  }

  return value;
}

function optionalText(value) {
  return String(value ?? "").trim() || null;
}

function verifyInvoicePaymentContext(context, invoice) {
  const invoiceReference = stripeReference(
    context.invoiceReference,
    "Invoice payment context reference",
  );
  const customerReference = stripeReference(
    context.customerReference,
    "Invoice payment context customer reference",
  );
  const subscriptionReference = stripeReference(
    context.subscriptionReference,
    "Invoice payment context subscription reference",
  );

  if (invoiceReference !== invoice.invoiceReference) {
    throw new Error("Stripe returned an unexpected Invoice reference.");
  }

  if (customerReference !== invoice.customerReference) {
    throw new Error(
      "Stripe Invoice payment context customer does not match event customer.",
    );
  }

  if (subscriptionReference !== invoice.subscriptionReference) {
    throw new Error(
      "Stripe Invoice payment context subscription does not match event.",
    );
  }

  return Object.freeze({
    invoiceReference,
    customerReference,
    subscriptionReference,
    invoiceStatus: optionalText(context.invoiceStatus),
    paymentStatus: optionalText(context.paymentStatus),
  });
}

class ProcessStripeSubscriptionEvent {
  constructor({
    createStripePayment,
    getSubscriptionRecord,
    writeSubscriptionRecord,
    now = () => new Date(),
  }) {
    this.createStripePayment = createStripePayment;
    this.getSubscriptionRecord = getSubscriptionRecord;
    this.writeSubscriptionRecord = writeSubscriptionRecord;
    this.now = now;
  }

  async execute({mode: inputMode, event: inputEvent} = {}) {
    const mode = requireMode(inputMode);
    const {event, eventType} = requireEvent(inputEvent);

    if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
      return Object.freeze({handled: false, eventType});
    }

    const invoice = normalizeInvoiceEvent(event);

    if (!invoice.subscriptionReference) {
      return Object.freeze({
        handled: false,
        eventType,
        mode,
        invoiceReference: invoice.invoiceReference,
      });
    }

    const stripePayment = this.createStripePayment({mode});

    if (typeof stripePayment?.retrieveSubscription !== "function") {
      throw new Error(
        "The Stripe payment provider cannot retrieve Subscriptions.",
      );
    }

    let paymentContext = null;

    if (
      eventType
      === STRIPE_SUBSCRIPTION_EVENT_TYPES.INVOICE_PAYMENT_ACTION_REQUIRED
    ) {
      if (
        typeof stripePayment?.retrieveInvoicePaymentContext !== "function"
      ) {
        throw new Error(
          "The Stripe payment provider cannot retrieve Invoice payment context.",
        );
      }

      paymentContext = verifyInvoicePaymentContext(
        requirePaymentContext(
          await stripePayment.retrieveInvoicePaymentContext(
            invoice.invoiceReference,
          ),
        ),
        invoice,
      );
    }

    const subscription = requireSubscriptionResult(
      await stripePayment.retrieveSubscription(
        invoice.subscriptionReference,
      ),
    );
    const subscriptionReference = stripeReference(
      subscription.subscriptionReference,
      "Subscription result reference",
    );
    const customerReference = stripeReference(
      subscription.customerReference,
      "Subscription result customer reference",
    );

    if (subscriptionReference !== invoice.subscriptionReference) {
      throw new Error(
        "Stripe returned an unexpected Subscription reference.",
      );
    }

    if (customerReference !== invoice.customerReference) {
      throw new Error(
        "Stripe Subscription customer does not match Invoice customer.",
      );
    }

    const existingRecord = await this.getSubscriptionRecord({
      mode,
      customerReference,
      subscriptionReference,
    });

    if (!existingRecord) {
      throw new Error(
        `Stripe subscription ${subscriptionReference} is not registered ` +
        `for customer ${customerReference} in ${mode} mode.`,
      );
    }

    const status = String(subscription.status ?? "").trim();

    if (!status) {
      throw new Error("Stripe Subscription status is required.");
    }

    const invoicePaid = eventType
      === STRIPE_SUBSCRIPTION_EVENT_TYPES.INVOICE_PAID
      || paymentContext?.invoiceStatus === "paid"
      || paymentContext?.paymentStatus === "succeeded";
    const latestInvoiceStatus = invoicePaid
      ? "paid"
      : paymentContext?.invoiceStatus ?? null;
    const latestPaymentStatus = invoicePaid
      ? "succeeded"
      : paymentContext?.paymentStatus ?? null;
    const paymentActionRequiredAt = (
      latestInvoiceStatus === "open"
      && latestPaymentStatus === "requires_action"
    ) ? existingRecord.paymentActionRequiredAt ?? this.now() : null;

    await this.writeSubscriptionRecord({
      mode,
      customerReference,
      subscriptionReference,
      paymentMethodReference: existingRecord.paymentMethodReference,
      status,
      amount: existingRecord.amount,
      currency: existingRecord.currency,
      interval: existingRecord.interval,
      intervalCount: existingRecord.intervalCount,
      subscriptionStartDate: subscription.subscriptionStartDate,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      latestInvoiceReference: invoice.invoiceReference,
      latestInvoiceStatus,
      latestPaymentStatus,
      paymentActionRequiredAt,
    });

    return Object.freeze({
      handled: true,
      eventType,
      mode,
      invoiceReference: invoice.invoiceReference,
      customerReference,
      subscriptionReference,
      status,
      subscriptionStartDate: subscription.subscriptionStartDate,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      latestInvoiceStatus,
      latestPaymentStatus,
      paymentActionRequiredAt,
    });
  }
}

module.exports = {
  ProcessStripeSubscriptionEvent,
  STRIPE_SUBSCRIPTION_EVENT_TYPES,
  normalizeInvoiceEvent,
};
