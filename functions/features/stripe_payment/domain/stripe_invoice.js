const {createHash} = require("node:crypto");
const {billingDetails} = require("./stripe_invoice_billing");

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
      ?? invoice?.subscription
      ?? (invoice?.metadata?.rhx_recovery_version === "2" ? invoice.metadata.rhx_subscription : null),
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
  {includeRecoveryDetails = false, includeCardPaymentSecret = false, includeBillingDetails = false} = {},
) {
  includeRecoveryDetails ||= includeBillingDetails;
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
  const recoveryDetails = includeRecoveryDetails ? {
    autoAdvance: invoice.auto_advance === true,
    amountRemaining: requireAmount(invoice.amount_remaining),
    defaultPaymentMethodReference: optionalStripeReference(
      invoice.default_payment_method,
    ),
    collectionMethod: invoice.collection_method,
    billingReason: invoice.billing_reason || null,
    paymentAttempted: invoice.attempted === true,
    nextPaymentAttemptAt: Number.isSafeInteger(invoice.next_payment_attempt)
      ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null,
    failureCode: null,
  } : {};
  const billing = includeBillingDetails ? await billingDetails(stripeClient, invoice, subscriptionReference) : {};

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
      ...recoveryDetails,
      ...billing,
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

  const initialConfirmation = includeRecoveryDetails && invoice.billing_reason === "subscription_create"
    && paymentStatus === "requires_confirmation" && !!optionalStripeReference(paymentIntent.payment_method);
  const paymentClientSecret = !includeBillingDetails && (paymentStatus === "requires_action" || initialConfirmation
    || (includeCardPaymentSecret && ["requires_payment_method", "requires_confirmation"].includes(paymentStatus)))
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
    ...recoveryDetails,
    ...billing,
    ...(includeRecoveryDetails ? {
      paymentMethodReference: optionalStripeReference(paymentIntent.payment_method),
      failureCode: paymentIntent.last_payment_error?.decline_code
        || paymentIntent.last_payment_error?.code || null,
      failedPaymentMethodReference: optionalStripeReference(
        paymentIntent.last_payment_error?.payment_method ?? paymentIntent.payment_method),
    } : {}),
  });
}

// Stripe serializes payment of an Invoice. Replaying a transport attempt uses
// the same key; a fresh user-initiated attempt supplies a new reference.
async function payStripeInvoice(stripeClient, input = {}) {
  if (typeof stripeClient?.invoices?.pay !== "function") {
    throw new Error("The initialized Stripe client cannot pay invoices.");
  }
  const invoiceReference = requireReference(input.invoiceReference,
    "invoiceReference");
  const paymentMethodReference = requireReference(input.paymentMethodReference,
    "paymentMethodReference");
  const attempt = requireReference(input.idempotencyReference,
    "idempotencyReference");
  if (attempt.length > 500) {
    throw new Error("idempotencyReference must not exceed 500 characters.");
  }
  if (input.offSession !== undefined && typeof input.offSession !== "boolean") {
    throw new Error("offSession must be a boolean.");
  }
  const key = createHash("sha256")
    .update(JSON.stringify([invoiceReference, attempt]))
    .digest("hex");
  const invoice = await stripeClient.invoices.pay(invoiceReference, {
    payment_method: paymentMethodReference,
    off_session: input.offSession === true,
  }, {idempotencyKey: `retry-subscription-invoice-${key}`});
  if (invoice?.id !== invoiceReference) {
    throw new Error("Stripe returned an unexpected Invoice reference.");
  }
  return Object.freeze({invoiceReference, invoiceStatus: invoice.status});
}

async function disableStripeInvoiceAutomaticCollection(stripeClient, invoiceReference) {
  const reference = requireReference(invoiceReference, "invoiceReference");
  if (typeof stripeClient?.invoices?.update !== "function") throw Error("Stripe client cannot update invoices.");
  // Stop Stripe's retries for this invoice while future renewals retain their
  // normal first collection attempt. Manual invoice payment remains available.
  const invoice = await stripeClient.invoices.update(reference, {auto_advance: false});
  if (invoice?.id !== reference || invoice.auto_advance !== false) throw Error("Stripe did not disable automatic invoice collection.");
  return {invoiceReference: reference, autoAdvance: false};
}

module.exports = {
  retrieveStripeInvoicePaymentContext,
  payStripeInvoice,
  disableStripeInvoiceAutomaticCollection,
};
