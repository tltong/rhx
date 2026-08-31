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
  subscriptionTypes,
  subscriptionSchema
};
