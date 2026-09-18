const {
  paymentModes,
} = require("./payment_config_schema");

const STRIPE_CUSTOMERS_COLLECTION = "stripeCustomers";
const STRIPE_CUSTOMER_RECORDS_SUBCOLLECTION = "customers";
const STRIPE_INTERNAL_REFERENCES_SUBCOLLECTION = "internalReferences";
const STRIPE_SETUP_INTENTS_SUBCOLLECTION = "setupIntents";
const STRIPE_PAYMENT_METHODS_SUBCOLLECTION = "paymentMethods";
const STRIPE_SUBSCRIPTIONS_SUBCOLLECTION = "subscriptions";

const stripeCustomerModeDocumentIdPattern = "[test_or_prod]";
const stripeCustomerDocumentIdPattern = "[stripe_customer_reference]";
const stripeInternalReferenceDocumentIdPattern =
  "[sha256_internal_reference]";
const stripeSetupIntentDocumentIdPattern = "[setup_intent_reference]";
const stripePaymentMethodDocumentIdPattern = "[payment_method_reference]";
const stripeSubscriptionDocumentIdPattern = "[subscription_reference]";

const nullableString = Object.freeze({
  type: "string",
  nullable: true,
});
const nullableTimestamp = Object.freeze({
  type: "timestamp",
  nullable: true,
});

const stripeCustomerSchema = {
  collection: STRIPE_CUSTOMERS_COLLECTION,
  documentId: stripeCustomerModeDocumentIdPattern,
  fields: {
    mode: {
      type: "string",
      enum: Object.values(paymentModes),
    },
  },
  subcollections: {
    customers: {
      collection: STRIPE_CUSTOMER_RECORDS_SUBCOLLECTION,
      documentId: stripeCustomerDocumentIdPattern,
      fields: {
        internalReference: "string",
        email: nullableString,
        createdAt: "timestamp",
        updatedAt: "timestamp",
      },
      subcollections: {
        setupIntents: {
          collection: STRIPE_SETUP_INTENTS_SUBCOLLECTION,
          documentId: stripeSetupIntentDocumentIdPattern,
          fields: {
            status: "string",
            usage: "string",
            paymentMethodReference: nullableString,
            createdAt: "timestamp",
            updatedAt: "timestamp",
          },
        },
        paymentMethods: {
          collection: STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
          documentId: stripePaymentMethodDocumentIdPattern,
          fields: {
            setupIntentReference: nullableString,
            type: "string",
            status: "string",
            card: {
              type: "map",
              nullable: true,
              fields: {
                brand: "string",
                last4: "string",
                expiryMonth: "number",
                expiryYear: "number",
              },
            },
            createdAt: "timestamp",
            updatedAt: "timestamp",
          },
        },
        subscriptions: {
          collection: STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
          documentId: stripeSubscriptionDocumentIdPattern,
          fields: {
            studentId: nullableString,
            planId: nullableString,
            paymentMethodReference: "string",
            status: "string",
            amount: "number",
            currency: "string",
            interval: "string",
            intervalCount: "number",
            subscriptionStartDate: nullableTimestamp,
            currentPeriodStart: nullableTimestamp,
            currentPeriodEnd: nullableTimestamp,
            cancelAtPeriodEnd: "boolean",
            latestInvoiceReference: nullableString,
            latestInvoiceStatus: nullableString,
            latestPaymentStatus: nullableString,
            paymentActionRequiredAt: nullableTimestamp,
            createdAt: "timestamp",
            updatedAt: "timestamp",
          },
        },
      },
    },
    internalReferences: {
      collection: STRIPE_INTERNAL_REFERENCES_SUBCOLLECTION,
      documentId: stripeInternalReferenceDocumentIdPattern,
      fields: {
        internalReference: "string",
        customerReference: "string",
        createdAt: "timestamp",
        updatedAt: "timestamp",
      },
    },
  },
};

module.exports = {
  STRIPE_CUSTOMERS_COLLECTION,
  STRIPE_CUSTOMER_RECORDS_SUBCOLLECTION,
  STRIPE_INTERNAL_REFERENCES_SUBCOLLECTION,
  STRIPE_SETUP_INTENTS_SUBCOLLECTION,
  STRIPE_PAYMENT_METHODS_SUBCOLLECTION,
  STRIPE_SUBSCRIPTIONS_SUBCOLLECTION,
  stripeCustomerModeDocumentIdPattern,
  stripeCustomerDocumentIdPattern,
  stripeInternalReferenceDocumentIdPattern,
  stripeSetupIntentDocumentIdPattern,
  stripePaymentMethodDocumentIdPattern,
  stripeSubscriptionDocumentIdPattern,
  stripeCustomerModes: paymentModes,
  stripeCustomerSchema,
};
