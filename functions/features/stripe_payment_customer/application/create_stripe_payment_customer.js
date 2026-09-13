function requireInternalReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("internalReference is required.");
  }

  if (reference.length > 500) {
    throw new Error("internalReference must not exceed 500 characters.");
  }

  return reference;
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

function requireCustomerReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error(
      "The Stripe payment provider did not return a customer reference.",
    );
  }

  return reference;
}

class CreateStripePaymentCustomer {
  constructor({
    createPaymentProviderContext,
    getCustomerRecordByInternalReference,
    createCustomerRecord,
    replaceCustomerRecord,
  }) {
    this.createPaymentProviderContext = createPaymentProviderContext;
    this.getCustomerRecordByInternalReference =
      getCustomerRecordByInternalReference;
    this.createCustomerRecord = createCustomerRecord;
    this.replaceCustomerRecord = replaceCustomerRecord;
  }

  async execute({internalReference, email} = {}) {
    const reference = requireInternalReference(internalReference);
    const customerEmail = requireEmail(email);
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

    if (typeof paymentProvider?.createCustomer !== "function") {
      throw new Error(
        "The configured Stripe payment provider cannot create customers.",
      );
    }

    if (typeof paymentProvider?.customerExists !== "function") {
      throw new Error(
        "The configured Stripe payment provider cannot retrieve customers.",
      );
    }

    const existingRecord =
      await this.getCustomerRecordByInternalReference({
        mode,
        internalReference: reference,
      });

    if (
      existingRecord
      && await paymentProvider.customerExists(
        existingRecord.customerReference,
      )
    ) {
      return existingRecord.customerReference;
    }

    const customerReference = requireCustomerReference(
      await paymentProvider.createCustomer(reference, customerEmail),
    );

    try {
      const customerRecord = {
        mode,
        customerReference,
        internalReference: reference,
        email: customerEmail,
      };

      if (existingRecord) {
        await this.replaceCustomerRecord({
          ...customerRecord,
          staleCustomerReference: existingRecord.customerReference,
        });
      } else {
        await this.createCustomerRecord(customerRecord);
      }
    } catch (error) {
      if (
        error?.code !== "already-exists"
        && error?.code !== "not-found"
      ) {
        throw error;
      }

      const concurrentRecord =
        await this.getCustomerRecordByInternalReference({
          mode,
          internalReference: reference,
        });

      if (!concurrentRecord) {
        throw error;
      }

      if (
        !await paymentProvider.customerExists(
          concurrentRecord.customerReference,
        )
      ) {
        throw error;
      }

      return concurrentRecord.customerReference;
    }

    return customerReference;
  }
}

module.exports = {
  CreateStripePaymentCustomer,
};
