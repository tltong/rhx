function requireReference(value, fieldName) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    throw new Error(`${fieldName} is required.`);
  }

  return reference;
}

function optionalStripeReference(value) {
  return String(
    value && typeof value === "object" ? value.id ?? "" : value ?? "",
  ).trim() || null;
}

function requireStripeText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`Stripe did not return ${fieldName}.`);
  }

  return text;
}

function requireAmount(value) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Stripe did not return a valid Invoice amount due.");
  }

  return amount;
}

function requireCurrency(value) {
  const currency = String(value ?? "").trim().toLowerCase();

  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("Stripe did not return a valid Invoice currency.");
  }

  return currency;
}

function invoiceSubscriptionReference(invoice) {
  return optionalStripeReference(
    invoice?.parent?.subscription_details?.subscription
      ?? invoice?.subscription,
  );
}

function confirmationSecret(invoice) {
  return String(
    invoice?.confirmation_secret?.client_secret ?? "",
  ).trim() || null;
}

function paymentIntentReferenceFromSecret(clientSecret) {
  const separator = "_secret_";
  const separatorIndex = String(clientSecret ?? "").indexOf(separator);

  if (separatorIndex < 1) {
    return null;
  }

  const reference = clientSecret.slice(0, separatorIndex);

  return reference.startsWith("pi_") ? reference : null;
}

function defaultPaymentIntentReference(invoice) {
  const payments = Array.isArray(invoice?.payments?.data)
    ? invoice.payments.data
    : [];
  const invoicePayment = payments.find((payment) => (
    payment?.is_default === true
    && payment?.payment?.type === "payment_intent"
  )) ?? payments.find((payment) => (
    payment?.payment?.type === "payment_intent"
  ));

  return optionalStripeReference(
    invoicePayment?.payment?.payment_intent,
  ) ?? paymentIntentReferenceFromSecret(confirmationSecret(invoice));
}

async function retrieveStripeInvoicePaymentContext(
  stripeClient,
  invoiceReference,
) {
  const reference = requireReference(invoiceReference, "invoiceReference");

  if (typeof stripeClient?.invoices?.retrieve !== "function") {
    throw new Error(
      "The initialized Stripe client cannot retrieve Invoices.",
    );
  }

  const invoice = await stripeClient.invoices.retrieve(reference, {
    expand: [
      "confirmation_secret",
      "payments.data.payment.payment_intent",
    ],
  });
  const returnedReference = requireStripeText(
    invoice?.id,
    "an Invoice reference",
  );

  if (returnedReference !== reference) {
    throw new Error("Stripe returned an unexpected Invoice reference.");
  }

  const customerReference = requireStripeText(
    optionalStripeReference(invoice?.customer),
    "an Invoice customer reference",
  );
  const invoiceStatus = requireStripeText(
    invoice?.status,
    "an Invoice status",
  );
  const subscriptionReference = invoiceSubscriptionReference(invoice);
  const amountDue = requireAmount(invoice?.amount_due);
  const currency = requireCurrency(invoice?.currency);
  const paymentIntentReference = defaultPaymentIntentReference(invoice);

  if (!paymentIntentReference) {
    return Object.freeze({
      invoiceReference: returnedReference,
      customerReference,
      subscriptionReference,
      invoiceStatus,
      paymentIntentReference: null,
      paymentStatus: null,
      paymentClientSecret: null,
      amountDue,
      currency,
    });
  }

  if (typeof stripeClient?.paymentIntents?.retrieve !== "function") {
    throw new Error(
      "The initialized Stripe client cannot retrieve PaymentIntents.",
    );
  }

  const paymentIntent = await stripeClient.paymentIntents.retrieve(
    paymentIntentReference,
  );
  const returnedPaymentIntentReference = requireStripeText(
    paymentIntent?.id,
    "a PaymentIntent reference",
  );

  if (returnedPaymentIntentReference !== paymentIntentReference) {
    throw new Error(
      "Stripe returned an unexpected PaymentIntent reference.",
    );
  }

  const paymentStatus = requireStripeText(
    paymentIntent?.status,
    "a PaymentIntent status",
  );
  const paymentCustomerReference = optionalStripeReference(
    paymentIntent?.customer,
  );

  if (
    paymentCustomerReference
    && paymentCustomerReference !== customerReference
  ) {
    throw new Error(
      "Stripe PaymentIntent customer does not match Invoice customer.",
    );
  }

  const paymentClientSecret = paymentStatus === "requires_action"
    ? requireStripeText(
      paymentIntent?.client_secret ?? confirmationSecret(invoice),
      "a PaymentIntent client secret",
    )
    : null;

  return Object.freeze({
    invoiceReference: returnedReference,
    customerReference,
    subscriptionReference,
    invoiceStatus,
    paymentIntentReference: returnedPaymentIntentReference,
    paymentStatus,
    paymentClientSecret,
    amountDue,
    currency,
  });
}

module.exports = {
  retrieveStripeInvoicePaymentContext,
};
