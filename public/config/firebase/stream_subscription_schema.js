export const STREAM_SUBSCRIPTIONS_COLLECTION = "streamSubscriptions";
export const streamSubscriptionDocumentIdPattern = "[student_id]";

export const streamSubscriptionSchema = {
  collection: STREAM_SUBSCRIPTIONS_COLLECTION,
  documentId: streamSubscriptionDocumentIdPattern,
  fields: {
    streamId: "string"
  }
};

export default {
  STREAM_SUBSCRIPTIONS_COLLECTION,
  streamSubscriptionDocumentIdPattern,
  streamSubscriptionSchema
};
