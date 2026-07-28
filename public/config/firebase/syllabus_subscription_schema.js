export const SYLLABUS_SUBSCRIPTIONS_COLLECTION = "syllabusSubscriptions";
export const SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION = "syllabuses";

export const syllabusSubscriptionDocumentIdPattern = "[student_id]";
export const syllabusSubscriptionSyllabusDocumentIdPattern = "[syllabus_id]";

export const syllabusSubscriptionStates = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive"
});

export const syllabusSubscriptionSchema = {
  collection: SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  documentId: syllabusSubscriptionDocumentIdPattern,
  subcollections: {
    syllabuses: {
      collection: SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
      documentId: syllabusSubscriptionSyllabusDocumentIdPattern,
      fields: {
        language: "string",
        state: {
          type: "string",
          enum: Object.values(syllabusSubscriptionStates)
        },
        subscribedAt: "timestamp",
        updatedAt: "timestamp"
      }
    }
  }
};

export default {
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
  syllabusSubscriptionDocumentIdPattern,
  syllabusSubscriptionSyllabusDocumentIdPattern,
  syllabusSubscriptionStates,
  syllabusSubscriptionSchema
};
