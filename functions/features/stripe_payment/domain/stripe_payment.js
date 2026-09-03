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

  async createCustomer(inputReference) {
    const customer = await this.stripeClient.customers.create({
      metadata: {
        clientReference: requireInputReference(inputReference),
      },
    });
    const customerReference = String(customer?.id ?? "").trim();

    if (!customerReference) {
      throw new Error("Stripe did not return a customer reference.");
    }

    return customerReference;
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
    const clientSecret = String(
      setupIntent?.client_secret ?? "",
    ).trim();

    if (!clientSecret) {
      throw new Error("Stripe did not return a SetupIntent client secret.");
    }

    return clientSecret;
  }
}

module.exports = {
  StripePayment,
};
