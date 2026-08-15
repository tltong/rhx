const {
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
} = require("../../../schema/syllabus_subscription_schema");
const {
  readDocument,
} = require("../../../utils/firebase/firebase_ops");
const {
  SyllabusSubscription,
} = require("../domain/syllabus_subscription");
const {
  SyllabusSubscriptionRepository,
} = require("../domain/syllabus_subscription_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function studentSyllabusesCollectionPath(studentId) {
  return [
    SYLLABUS_SUBSCRIPTIONS_COLLECTION,
    studentId,
    SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
  ].join("/");
}

class FirestoreSyllabusSubscriptionRepository
  extends SyllabusSubscriptionRepository {
  constructor({readSubscriptionDocument = readDocument} = {}) {
    super();
    this.readSubscriptionDocument = readSubscriptionDocument;
  }

  async get(studentId, syllabusId) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const normalizedSyllabusId = requireIdentifier(syllabusId, "syllabusId");
    const data = await this.readSubscriptionDocument(
      studentSyllabusesCollectionPath(normalizedStudentId),
      normalizedSyllabusId,
    );

    if (!data) {
      return null;
    }

    return new SyllabusSubscription({
      studentId: normalizedStudentId,
      syllabusId: normalizedSyllabusId,
      language: data.language,
    });
  }
}

module.exports = {
  FirestoreSyllabusSubscriptionRepository,
};
