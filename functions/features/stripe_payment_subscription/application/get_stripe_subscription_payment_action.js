function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(fieldName + " is required.");
  }

  return text;
}

function requireDocumentReference(value, fieldName) {
  const reference = requireText(value, fieldName);

  if (reference.includes("/")) {
    throw new Error(fieldName + " must not contain a slash.");
  }

  return reference;
}

function optionalText(value) {
  return String(value ?? "").trim() || null;
}

function notFound() {
  const error = new Error("Stripe subscription could not be found.");
  error.code = "not-found";
  return error;
}

function noPendingPaymentAction() {
  const error = new Error(
    "This Stripe subscription has no pending invoice payment action.",
  );
  error.code = "failed-precondition";
  return error;
}

function requirePaymentContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "The Stripe payment provider did not return Invoice payment context.",
    );
  }

  const amountDue = Number(value.amountDue);
  const currency = optionalText(value.currency)?.toLowerCase() ?? null;

  if (!Number.isSafeInteger(amountDue) || amountDue < 0) {
    throw new Error("Stripe did not return a valid Invoice amount due.");
  }

  if (!currency || !/^[a-z]{3}$/.test(currency)) {
    throw new Error("Stripe did not return a valid Invoice currency.");
  }

  return Object.freeze({
    invoiceReference: requireDocumentReference(
      value.invoiceReference,
      "invoiceReference",
    ),
    customerReference: requireDocumentReference(
      value.customerReference,
      "customerReference",
    ),
    subscriptionReference: requireDocumentReference(
      value.subscriptionReference,
      "subscriptionReference",
    ),
    invoiceStatus: optionalText(value.invoiceStatus),
    paymentStatus: optionalText(value.paymentStatus),
    paymentClientSecret: optionalText(value.paymentClientSecret),
    amountDue,
    currency,
  });
}

function actionForPaymentContext(context) {
  if (
    context.invoiceStatus === "paid"
    || context.paymentStatus === "succeeded"
  ) {
    return "complete";
  }

  if (context.paymentStatus === "requires_action") {
    if (!context.paymentClientSecret) {
      throw new Error(
        "Stripe did not return the client secret needed to complete payment.",
      );
    }

    return "confirm_payment";
  }

  if (context.paymentStatus === "processing") {
    return "wait";
  }

  if (context.paymentStatus === "requires_payment_method") {
    return "replace_payment_method";
  }

  return "unavailable";
}

class GetStripeSubscriptionPaymentAction {
  constructor({
    createPaymentProviderContext,
    getCustomerRecordByInternalReference,
    getSubscriptionRecord,
  }) {
    this.createPaymentProviderContext = createPaymentProviderContext;
    this.getCustomerRecordByInternalReference =
      getCustomerRecordByInternalReference;
    this.getSubscriptionRecord = getSubscriptionRecord;
  }

  async execute(input = {}) {
    const internalReference = requireText(
      input.internalReference,
      "internalReference",
    );
    const subscriptionReference = requireDocumentReference(
      input.subscriptionReference,
      "subscriptionReference",
    );
    const {
      providerName,
      mode,
      paymentProvider,
    } = await this.createPaymentProviderContext();

    if (providerName !== "stripe") {
      throw new Error("The configured payment provider is not Stripe.");
    }

    if (
      typeof paymentProvider?.retrieveInvoicePaymentContext !== "function"
    ) {
      throw new Error(
        "The configured Stripe payment provider cannot retrieve Invoice " +
        "payment context.",
      );
    }

    const customer = await this.getCustomerRecordByInternalReference({
      mode,
      internalReference,
    });

    if (!customer) {
      throw notFound();
    }

    const customerReference = requireDocumentReference(
      customer.customerReference,
      "customerReference",
    );
    const subscription = await this.getSubscriptionRecord({
      mode,
      customerReference,
      subscriptionReference,
    });

    if (!subscription) {
      throw notFound();
    }

    const storedInvoiceReference = optionalText(
      subscription.latestInvoiceReference,
    );

    if (!storedInvoiceReference) {
      throw noPendingPaymentAction();
    }

    const invoiceReference = requireDocumentReference(
      storedInvoiceReference,
      "latestInvoiceReference",
    );
    const context = requirePaymentContext(
      await paymentProvider.retrieveInvoicePaymentContext(
        invoiceReference,
      ),
    );

    if (
      context.invoiceReference !== invoiceReference
      || context.customerReference !== customerReference
      || context.subscriptionReference !== subscriptionReference
    ) {
      throw new Error(
        "Stripe Invoice payment context does not match the stored " +
        "subscription.",
      );
    }

    const action = actionForPaymentContext(context);

    return Object.freeze({
      action,
      subscriptionReference,
      invoiceReference,
      paymentStatus: context.paymentStatus
        ?? (action === "complete" ? "succeeded" : null),
      paymentClientSecret: action === "confirm_payment"
        ? context.paymentClientSecret
        : null,
      amountDue: context.amountDue,
      currency: context.currency,
    });
  }
}

module.exports = {
  GetStripeSubscriptionPaymentAction,
  actionForPaymentContext,
};
