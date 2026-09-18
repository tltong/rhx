const {
  paymentModes,
  paymentProviders,
} = require("./payment_config_schema");

const SUBSCRIPTIONS_COLLECTION = "subscriptions";
const SUBSCRIPTION_PAYMENTS_SUBCOLLECTION = "payments";

const subscriptionDocumentIdPattern = "[student_id]";
const subscriptionPaymentDocumentIdPattern = "[auto_generated_id]";

const subscriptionTypes = Object.freeze({
  TRIAL: "trial",
  ONGOING: "ongoing",
});

const nullableString = Object.freeze({
  type: "string",
  nullable: true,
});
const nullableTimestamp = Object.freeze({
  type: "timestamp",
  nullable: true,
});

const subscriptionSchema = {
  collection: SUBSCRIPTIONS_COLLECTION,
  documentId: subscriptionDocumentIdPattern,
  fields: {
    subscriptionType: {
      type: "string",
      enum: Object.values(subscriptionTypes),
    },
    activeUntil: nullableTimestamp,
    paymentProvider: {
      ...nullableString,
      enum: Object.values(paymentProviders),
    },
    paymentMode: {
      ...nullableString,
      enum: Object.values(paymentModes),
    },
    paymentCustomerReference: nullableString,
    paymentSubscriptionReference: nullableString,
    planId: nullableString,
    createdAt: "timestamp",
    updatedAt: "timestamp",
  },
  subcollections: {
    payments: {
      collection: SUBSCRIPTION_PAYMENTS_SUBCOLLECTION,
      documentId: subscriptionPaymentDocumentIdPattern,
      fields: {
        guardianId: "string",
        planId: "string",
        durationMonths: "number",
        amountPaid: "number",
        currency: "string",
        paymentDate: "timestamp",
        paymentProvider: "string",
        paymentProviderReference: "string",
        createdAt: "timestamp",
      },
    },
  },
};

module.exports = {
  SUBSCRIPTIONS_COLLECTION,
  SUBSCRIPTION_PAYMENTS_SUBCOLLECTION,
  paymentModes,
  paymentProviders,
  subscriptionDocumentIdPattern,
  subscriptionPaymentDocumentIdPattern,
  subscriptionSchema,
  subscriptionTypes,
};
