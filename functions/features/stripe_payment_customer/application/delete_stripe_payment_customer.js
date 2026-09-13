function requireCustomerReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("customerReference is required.");
  }

  if (reference.length > 500) {
    throw new Error("customerReference must not exceed 500 characters.");
  }

  return reference;
}

function requireDeletedCustomerReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error(
      "The Stripe payment provider did not confirm customer deletion.",
    );
  }

  return reference;
}

class DeleteStripePaymentCustomer {
  constructor({
    createPaymentProviderContext,
    deleteCustomerRecord,
  }) {
    this.createPaymentProviderContext = createPaymentProviderContext;
    this.deleteCustomerRecord = deleteCustomerRecord;
  }

  async execute({customerReference} = {}) {
    const reference = requireCustomerReference(customerReference);
    const {
      providerName,
      mode,
      paymentProvider,
    } = await this.createPaymentProviderContext();

    if (providerName !== "stripe") {
      throw new Error(
        "The configured payment provider is not Stripe.",
      );
    }

    if (typeof paymentProvider?.deleteCustomer !== "function") {
      throw new Error(
        "The configured Stripe payment provider cannot delete customers.",
      );
    }

    const deletedReference = requireDeletedCustomerReference(
      await paymentProvider.deleteCustomer(reference),
    );

    await this.deleteCustomerRecord({
      mode,
      customerReference: deletedReference,
    });

    return deletedReference;
  }
}

module.exports = {
  DeleteStripePaymentCustomer,
};
