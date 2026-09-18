const {
  SUBSCRIPTIONS_COLLECTION,
} = require("../../../schema/subscription_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  StudentSubscription,
} = require("../domain/student_subscription");
const {
  StudentSubscriptionRepository,
} = require("../domain/student_subscription_repository");

function requireNonEmptyString(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function toSubscription(studentId, data) {
  if (!data) {
    return null;
  }

  return new StudentSubscription({
    studentId,
    subscriptionType: data.subscriptionType,
    activeUntil: data.activeUntil,
    paymentProvider: data.paymentProvider,
    paymentMode: data.paymentMode,
    paymentCustomerReference: data.paymentCustomerReference,
    paymentSubscriptionReference: data.paymentSubscriptionReference,
    planId: data.planId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

function toSubscriptionRecord(subscription) {
  return {
    subscriptionType: subscription.subscriptionType,
    activeUntil: subscription.activeUntil,
    paymentProvider: subscription.paymentProvider,
    paymentMode: subscription.paymentMode,
    paymentCustomerReference: subscription.paymentCustomerReference,
    paymentSubscriptionReference:
      subscription.paymentSubscriptionReference,
    planId: subscription.planId,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

class FirestoreStudentSubscriptionRepository
  extends StudentSubscriptionRepository {
  constructor({
    createDocumentIfAbsent = firebaseOps.createDocumentIfAbsent,
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.createDocumentIfAbsent = createDocumentIfAbsent;
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
  }

  async getSubscription(studentId) {
    const normalizedStudentId = requireNonEmptyString(
      studentId,
      "studentId",
    );
    const data = await this.readDocument(
      SUBSCRIPTIONS_COLLECTION,
      normalizedStudentId,
    );

    return toSubscription(normalizedStudentId, data);
  }

  async createSubscription(subscription) {
    const record = subscription instanceof StudentSubscription
      ? subscription
      : new StudentSubscription(subscription);

    await this.createDocumentIfAbsent(
      SUBSCRIPTIONS_COLLECTION,
      record.studentId,
      toSubscriptionRecord(record),
    );

    return record;
  }

  async saveSubscription(subscription) {
    const record = subscription instanceof StudentSubscription
      ? subscription
      : new StudentSubscription(subscription);

    await this.writeDocument(
      SUBSCRIPTIONS_COLLECTION,
      record.studentId,
      toSubscriptionRecord(record),
      {merge: false},
    );

    return record;
  }
}

module.exports = {
  FirestoreStudentSubscriptionRepository,
};
