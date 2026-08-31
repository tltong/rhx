import {
  SUBSCRIPTIONS_COLLECTION,
  SUBSCRIPTION_PAYMENTS_SUBCOLLECTION
} from "../../../config/firebase/subscription_schema.js?v=20260829-student-subscriptions-v1";
import {
  createDocument,
  createDocumentIfAbsent,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  StudentSubscription,
  SubscriptionPayment
} from "../domain/student_subscription.js?v=20260829-student-subscriptions-v1";
import {
  StudentSubscriptionRepository
} from "../domain/student_subscription_repository.js";

function requireNonEmptyString(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function getPaymentsCollectionPath(studentId) {
  return [
    SUBSCRIPTIONS_COLLECTION,
    requireNonEmptyString(studentId, "studentId"),
    SUBSCRIPTION_PAYMENTS_SUBCOLLECTION
  ].join("/");
}

function toSubscription(studentId, data) {
  if (!data) {
    return null;
  }

  return new StudentSubscription({
    studentId,
    subscriptionType: data.subscriptionType,
    activeUntil: data.activeUntil,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  });
}

function toSubscriptionRecord(subscription) {
  return {
    subscriptionType: subscription.subscriptionType,
    activeUntil: subscription.activeUntil,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt
  };
}

function toPayment(studentId, data) {
  if (!data) {
    return null;
  }

  return new SubscriptionPayment({
    id: data.id,
    studentId,
    guardianId: data.guardianId,
    planId: data.planId,
    durationMonths: data.durationMonths,
    amountPaid: data.amountPaid,
    currency: data.currency,
    paymentDate: data.paymentDate,
    paymentProvider: data.paymentProvider,
    paymentProviderReference: data.paymentProviderReference,
    createdAt: data.createdAt
  });
}

function toPaymentRecord(payment) {
  return {
    guardianId: payment.guardianId,
    planId: payment.planId,
    durationMonths: payment.durationMonths,
    amountPaid: payment.amountPaid,
    currency: payment.currency,
    paymentDate: payment.paymentDate,
    paymentProvider: payment.paymentProvider,
    paymentProviderReference: payment.paymentProviderReference,
    createdAt: payment.createdAt
  };
}

function timestampToMillis(value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  return 0;
}

export class FirestoreStudentSubscriptionRepository
  extends StudentSubscriptionRepository {
  async getSubscription(studentId) {
    const normalizedStudentId = requireNonEmptyString(
      studentId,
      "studentId"
    );
    const data = await readDocument(
      SUBSCRIPTIONS_COLLECTION,
      normalizedStudentId
    );

    return toSubscription(normalizedStudentId, data);
  }

  async createSubscription(subscription) {
    await createDocumentIfAbsent(
      SUBSCRIPTIONS_COLLECTION,
      subscription.studentId,
      toSubscriptionRecord(subscription)
    );

    return subscription;
  }

  async saveSubscription(subscription) {
    await writeDocument(
      SUBSCRIPTIONS_COLLECTION,
      subscription.studentId,
      toSubscriptionRecord(subscription),
      { merge: false }
    );

    return subscription;
  }

  async getPayment(studentId, paymentId) {
    const normalizedStudentId = requireNonEmptyString(
      studentId,
      "studentId"
    );
    const data = await readDocument(
      getPaymentsCollectionPath(normalizedStudentId),
      requireNonEmptyString(paymentId, "paymentId")
    );

    return toPayment(normalizedStudentId, data);
  }

  async listPayments(studentId) {
    const normalizedStudentId = requireNonEmptyString(
      studentId,
      "studentId"
    );
    const records = await readCollection(
      getPaymentsCollectionPath(normalizedStudentId)
    );

    return records
      .map((record) => toPayment(normalizedStudentId, record))
      .sort((first, second) => (
        timestampToMillis(second.paymentDate)
        - timestampToMillis(first.paymentDate)
      ));
  }

  async createPayment(payment) {
    const result = await createDocument(
      getPaymentsCollectionPath(payment.studentId),
      toPaymentRecord(payment)
    );

    payment.id = result.id;

    return payment;
  }
}
