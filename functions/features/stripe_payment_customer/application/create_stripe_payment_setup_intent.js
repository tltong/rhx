function requireCustomerReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error("customerReference is required.");
  }

  return reference;
}

function requireResultText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(
      `The Stripe payment provider did not return ${fieldName}.`,
    );
  }

  return text;
}

function normalizeSetupIntentResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error(
      "The Stripe payment provider did not return SetupIntent details.",
    );
  }

  return {
    setupIntentReference: requireResultText(
      result.setupIntentReference,
      "a SetupIntent reference",
    ),
    clientSecret: requireResultText(
      result.clientSecret,
      "a SetupIntent client secret",
    ),
    status: requireResultText(result.status, "a SetupIntent status"),
    usage: requireResultText(result.usage, "a SetupIntent usage"),
    paymentMethodReference: result.paymentMethodReference || null,
  };
}

class CreateStripePaymentSetupIntent {
  constructor({
    createPaymentProviderContext,
    getCustomerRecordByReference,
    writeSetupIntentRecord,
  }) {
    this.createPaymentProviderContext = createPaymentProviderContext;
    this.getCustomerRecordByReference = getCustomerRecordByReference;
    this.writeSetupIntentRecord = writeSetupIntentRecord;
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

    if (typeof paymentProvider?.createSetupIntent !== "function") {
      throw new Error(
        "The configured Stripe payment provider cannot create SetupIntents.",
      );
    }

    const customerRecord = await this.getCustomerRecordByReference({
      mode,
      customerReference: reference,
    });

    if (!customerRecord) {
      throw new Error(
        `Stripe customer ${reference} is not registered in ${mode} mode.`,
      );
    }

    const setupIntent = normalizeSetupIntentResult(
      await paymentProvider.createSetupIntent(reference),
    );

    await this.writeSetupIntentRecord({
      mode,
      customerReference: reference,
      setupIntentReference: setupIntent.setupIntentReference,
      status: setupIntent.status,
      usage: setupIntent.usage,
      paymentMethodReference: setupIntent.paymentMethodReference,
    });

    return setupIntent.clientSecret;
  }
}

module.exports = {
  CreateStripePaymentSetupIntent,
  normalizeSetupIntentResult,
};
