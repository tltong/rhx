const SYLLABUS_SUBSCRIPTIONS_COLLECTION = "syllabusSubscriptions";
const SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION = "syllabuses";

const syllabusSubscriptionDocumentIdPattern = "[student_id]";
const syllabusSubscriptionSyllabusDocumentIdPattern = "[syllabus_id]";

const syllabusSubscriptionStates = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive"
});

const syllabusSubscriptionSchema = {
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

module.exports = {
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
  syllabusSubscriptionDocumentIdPattern,
  syllabusSubscriptionSyllabusDocumentIdPattern,
  syllabusSubscriptionStates,
  syllabusSubscriptionSchema
};
