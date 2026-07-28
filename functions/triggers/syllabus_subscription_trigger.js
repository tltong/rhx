const { FieldValue } = require("firebase-admin/firestore");
const {
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");
const {
  writeDocument,
} = require("../utils/firebase/firebase_ops");
const {
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
} = require("../schema/syllabus_subscription_schema");

const SYLLABUS_SUBSCRIPTION_DOCUMENT = [
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  "{studentId}",
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
  "{syllabusId}",
].join("/");

const TRIGGER_TEST_COLLECTION = "firestore_test";
const TRIGGER_TEST_DOCUMENT = "syllabus_subscription_created";

const onSyllabusSubscriptionCreated = onDocumentCreated(
  {
    document: SYLLABUS_SUBSCRIPTION_DOCUMENT,
    region: "us-central1",
  },
  async (event) => {
    const { language } = event.data.data();

    await writeDocument(
      TRIGGER_TEST_COLLECTION,
      TRIGGER_TEST_DOCUMENT,
      {
        status: "test",
        studentId: event.params.studentId,
        syllabusId: event.params.syllabusId,
        language,
        triggeredAt: FieldValue.serverTimestamp(),
      },
      { merge: false },
    );
  },
);

module.exports = {
  onSyllabusSubscriptionCreated,
};
