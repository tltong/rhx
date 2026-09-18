import {
  paymentModes,
  paymentProviders
} from "./payment_config_schema.js?v=20260915-payment-provider-enum-v1";

export const SUBSCRIPTIONS_COLLECTION = "subscriptions";
export const SUBSCRIPTION_PAYMENTS_SUBCOLLECTION = "payments";

export const subscriptionDocumentIdPattern = "[student_id]";
export const subscriptionPaymentDocumentIdPattern = "[auto_generated_id]";

export const subscriptionTypes = Object.freeze({
  TRIAL: "trial",
  ONGOING: "ongoing"
});

export const subscriptionSchema = {
  collection: SUBSCRIPTIONS_COLLECTION,
  documentId: subscriptionDocumentIdPattern,
  fields: {
    subscriptionType: {
      type: "string",
      enum: Object.values(subscriptionTypes)
    },
    activeUntil: {
      type: "timestamp",
      nullable: true
    },
    paymentProvider: {
      type: "string",
      enum: Object.values(paymentProviders),
      nullable: true
    },
    paymentMode: {
      type: "string",
      enum: Object.values(paymentModes),
      nullable: true
    },
    paymentCustomerReference: {
      type: "string",
      nullable: true
    },
    paymentSubscriptionReference: {
      type: "string",
      nullable: true
    },
    planId: {
      type: "string",
      nullable: true
    },
    createdAt: "timestamp",
    updatedAt: "timestamp"
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
        createdAt: "timestamp"
      }
    }
  }
};

export default {
  SUBSCRIPTIONS_COLLECTION,
  SUBSCRIPTION_PAYMENTS_SUBCOLLECTION,
  subscriptionDocumentIdPattern,
  subscriptionPaymentDocumentIdPattern,
  paymentModes,
  paymentProviders,
  subscriptionTypes,
  subscriptionSchema
};
