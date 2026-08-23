const STREAM_SUBSCRIPTIONS_COLLECTION = "streamSubscriptions";
const streamSubscriptionDocumentIdPattern = "[student_id]";

const streamSubscriptionSchema = {
  collection: STREAM_SUBSCRIPTIONS_COLLECTION,
  documentId: streamSubscriptionDocumentIdPattern,
  fields: {
    streamId: "string",
  },
};

module.exports = {
  STREAM_SUBSCRIPTIONS_COLLECTION,
  streamSubscriptionDocumentIdPattern,
  streamSubscriptionSchema,
};
