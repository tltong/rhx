const {randomUUID} = require("node:crypto");
const {
  retrieveStripeInvoicePaymentContext,
} = require("./stripe_invoice");
const {
  createStripeSubscription,
  retrieveStripeSubscription,
} = require("./stripe_subscription");

function requireInputReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("inputReference is required.");
  }

  if (reference.length > 500) {
    throw new Error("inputReference must not exceed 500 characters.");
  }

  return reference;
}

function requireCustomerReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("customerReference is required.");
  }

  return reference;
}

function requirePaymentMethodReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("paymentMethodReference is required.");
  }

  return reference;
}

function optionalStripeReference(value) {
  return String(
    value && typeof value === "object" ? value.id ?? "" : value ?? "",
  ).trim() || null;
}

function requireWebhookPayload(value) {
  if (
    (typeof value === "string" && value.length > 0)
    || (Buffer.isBuffer(value) && value.length > 0)
  ) {
    return value;
  }

  throw new Error("Stripe webhook payload is required.");
}

function requireWebhookText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`Stripe webhook ${fieldName} is required.`);
  }

  return text;
}

function requireEmail(value) {
  const email = String(value ?? "").trim();

  if (!email) {
    throw new Error("email is required.");
  }

  if (email.length > 320) {
    throw new Error("email must not exceed 320 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email must be a valid email address.");
  }

  return email;
}

function customerCreationIdempotencyKey() {
  return `create-payment-customer-${randomUUID()}`;
}

function isMissingStripeResource(error) {
  return error?.code === "resource_missing"
    || error?.statusCode === 404;
}

class StripePayment {
  constructor(stripeClient) {
    if (
      typeof stripeClient?.customers?.create !== "function"
      || typeof stripeClient?.customers?.del !== "function"
    ) {
      throw new Error("An initialized Stripe client is required.");
    }

    this.stripeClient = stripeClient;
  }

  async createCustomer(inputReference, email) {
    const reference = requireInputReference(inputReference);
    const customer = await this.stripeClient.customers.create({
      email: requireEmail(email),
      metadata: {
        clientReference: reference,
      },
    }, {
      idempotencyKey: customerCreationIdempotencyKey(),
    });
    const customerReference = String(customer?.id ?? "").trim();

    if (!customerReference) {
      throw new Error("Stripe did not return a customer reference.");
    }

    return customerReference;
  }

  async customerExists(customerReference) {
    const reference = requireCustomerReference(customerReference);

    if (typeof this.stripeClient?.customers?.retrieve !== "function") {
      throw new Error(
        "The initialized Stripe client cannot retrieve customers.",
      );
    }

    let customer;

    try {
      customer = await this.stripeClient.customers.retrieve(reference);
    } catch (error) {
      if (isMissingStripeResource(error)) {
        return false;
      }

      throw error;
    }

    const returnedReference = String(customer?.id ?? "").trim();

    if (!returnedReference) {
      throw new Error("Stripe did not return a customer reference.");
    }

    if (returnedReference !== reference) {
      throw new Error("Stripe returned an unexpected customer reference.");
    }

    return customer?.deleted !== true;
  }

  async deleteCustomer(customerReference) {
    const reference = requireCustomerReference(customerReference);
    const deletedCustomer = await this.stripeClient.customers.del(
      reference,
    );
    const deletedReference = String(deletedCustomer?.id ?? "").trim();

    if (
      !deletedReference
      || deletedCustomer?.deleted !== true
    ) {
      throw new Error("Stripe did not confirm customer deletion.");
    }

    return deletedReference;
  }

  async createSetupIntent(customerReference) {
    const reference = requireCustomerReference(customerReference);

    if (typeof this.stripeClient?.setupIntents?.create !== "function") {
      throw new Error(
        "The initialized Stripe client cannot create SetupIntents.",
      );
    }

    const setupIntent = await this.stripeClient.setupIntents.create({
      customer: reference,
      usage: "off_session",
      automatic_payment_methods: {
        enabled: true,
      },
    });
    const setupIntentReference = String(setupIntent?.id ?? "").trim();
    const clientSecret = String(
      setupIntent?.client_secret ?? "",
    ).trim();
    const status = String(setupIntent?.status ?? "").trim();
    const usage = String(setupIntent?.usage ?? "").trim();
    const paymentMethodReference = String(
      typeof setupIntent?.payment_method === "object"
        ? setupIntent.payment_method?.id ?? ""
        : setupIntent?.payment_method ?? "",
    ).trim() || null;

    if (!setupIntentReference) {
      throw new Error("Stripe did not return a SetupIntent reference.");
    }

    if (!clientSecret) {
      throw new Error("Stripe did not return a SetupIntent client secret.");
    }

    if (!status) {
      throw new Error("Stripe did not return a SetupIntent status.");
    }

    if (!usage) {
      throw new Error("Stripe did not return a SetupIntent usage.");
    }

    return Object.freeze({
      setupIntentReference,
      clientSecret,
      status,
      usage,
      paymentMethodReference,
    });
  }

  constructWebhookEvent({payload, signature, webhookSecret} = {}) {
    if (typeof this.stripeClient?.webhooks?.constructEvent !== "function") {
      throw new Error(
        "The initialized Stripe client cannot verify webhook events.",
      );
    }

    return this.stripeClient.webhooks.constructEvent(
      requireWebhookPayload(payload),
      requireWebhookText(signature, "signature"),
      requireWebhookText(webhookSecret, "signing secret"),
    );
  }

  async retrievePaymentMethod(paymentMethodReference) {
    const reference = requirePaymentMethodReference(paymentMethodReference);

    if (typeof this.stripeClient?.paymentMethods?.retrieve !== "function") {
      throw new Error(
        "The initialized Stripe client cannot retrieve PaymentMethods.",
      );
    }

    const paymentMethod = await this.stripeClient.paymentMethods.retrieve(
      reference,
    );
    const returnedReference = String(paymentMethod?.id ?? "").trim();
    const type = String(paymentMethod?.type ?? "").trim();

    if (!returnedReference) {
      throw new Error("Stripe did not return a PaymentMethod reference.");
    }

    if (returnedReference !== reference) {
      throw new Error("Stripe returned an unexpected PaymentMethod reference.");
    }

    if (!type) {
      throw new Error("Stripe did not return a PaymentMethod type.");
    }

    const card = paymentMethod.card
      ? Object.freeze({
        brand: String(paymentMethod.card.brand ?? "").trim(),
        last4: String(paymentMethod.card.last4 ?? "").trim(),
        expiryMonth: Number(paymentMethod.card.exp_month),
        expiryYear: Number(paymentMethod.card.exp_year),
      })
      : null;

    return Object.freeze({
      paymentMethodReference: returnedReference,
      customerReference: optionalStripeReference(paymentMethod.customer),
      type,
      card,
    });
  }

  async createSubscription(input) {
    return createStripeSubscription(this.stripeClient, input);
  }

  async retrieveSubscription(subscriptionReference) {
    return retrieveStripeSubscription(
      this.stripeClient,
      subscriptionReference,
    );
  }

  async retrieveInvoicePaymentContext(invoiceReference) {
    return retrieveStripeInvoicePaymentContext(
      this.stripeClient,
      invoiceReference,
    );
  }
}

module.exports = {
  StripePayment,
  customerCreationIdempotencyKey,
};
