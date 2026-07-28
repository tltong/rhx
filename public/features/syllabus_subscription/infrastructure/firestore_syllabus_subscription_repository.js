import {
  SyllabusSubscription
} from "../domain/syllabus_subscription.js?v=20260726-subscription-language";
import {
  SyllabusSubscriptionRepository
} from "../domain/syllabus_subscription_repository.js";
import {
  SYLLABUS_SUBSCRIPTIONS_COLLECTION,
  SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION,
  syllabusSubscriptionStates
} from "../../../config/firebase/syllabus_subscription_schema.js";
import {
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

const SUBSCRIPTION_STATE_VALUES = new Set(
  Object.values(syllabusSubscriptionStates)
);

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeState(state) {
  const normalizedState = String(state || "").trim().toLowerCase();

  if (!SUBSCRIPTION_STATE_VALUES.has(normalizedState)) {
    throw new Error(
      `state must be one of: ${Object.values(syllabusSubscriptionStates).join(", ")}.`
    );
  }

  return normalizedState;
}

function getStudentSyllabusesCollectionPath(studentId) {
  return [
    SYLLABUS_SUBSCRIPTIONS_COLLECTION,
    requireNonEmptyString(studentId, "studentId"),
    SYLLABUS_SUBSCRIPTION_SYLLABUSES_SUBCOLLECTION
  ].join("/");
}

function toSyllabusSubscription(data, studentId) {
  if (!data) {
    return null;
  }

  return new SyllabusSubscription({
    studentId,
    syllabusId: data.id,
    language: data.language || null,
    state: normalizeState(data.state),
    subscribedAt: data.subscribedAt || null,
    updatedAt: data.updatedAt || null
  });
}

function toSyllabusSubscriptionRecord(syllabusSubscription) {
  const now = new Date();

  return {
    language: requireNonEmptyString(
      syllabusSubscription.language,
      "language"
    ),
    state: normalizeState(syllabusSubscription.state),
    subscribedAt: syllabusSubscription.subscribedAt || now,
    updatedAt: syllabusSubscription.updatedAt || now
  };
}

export class FirestoreSyllabusSubscriptionRepository
  extends SyllabusSubscriptionRepository {
  async get(studentId, syllabusId) {
    const selectedStudentId = requireNonEmptyString(studentId, "studentId");
    const selectedSyllabusId = requireNonEmptyString(syllabusId, "syllabusId");
    const data = await readDocument(
      getStudentSyllabusesCollectionPath(selectedStudentId),
      selectedSyllabusId
    );

    return toSyllabusSubscription(data, selectedStudentId);
  }

  async listByStudent(studentId) {
    const selectedStudentId = requireNonEmptyString(studentId, "studentId");
    const subscriptions = await readCollection(
      getStudentSyllabusesCollectionPath(selectedStudentId)
    );

    return subscriptions
      .map((subscription) => toSyllabusSubscription(
        subscription,
        selectedStudentId
      ))
      .filter(Boolean)
      .sort((first, second) => first.syllabusId.localeCompare(second.syllabusId));
  }

  async listActiveByStudent(studentId) {
    const selectedStudentId = requireNonEmptyString(studentId, "studentId");
    const subscriptions = await readCollection(
      getStudentSyllabusesCollectionPath(selectedStudentId),
      (collection) => collection.where(
        "state",
        "==",
        syllabusSubscriptionStates.ACTIVE
      )
    );

    return subscriptions
      .map((subscription) => toSyllabusSubscription(
        subscription,
        selectedStudentId
      ))
      .filter(Boolean)
      .sort((first, second) => first.syllabusId.localeCompare(second.syllabusId));
  }

  async save(syllabusSubscription) {
    const studentId = requireNonEmptyString(
      syllabusSubscription.studentId,
      "studentId"
    );
    const syllabusId = requireNonEmptyString(
      syllabusSubscription.syllabusId,
      "syllabusId"
    );

    await writeDocument(
      SYLLABUS_SUBSCRIPTIONS_COLLECTION,
      studentId,
      {},
      { merge: true }
    );

    await writeDocument(
      getStudentSyllabusesCollectionPath(studentId),
      syllabusId,
      toSyllabusSubscriptionRecord(syllabusSubscription),
      { merge: false }
    );

    return syllabusSubscription;
  }

  async delete(studentId, syllabusId) {
    const selectedStudentId = requireNonEmptyString(studentId, "studentId");
    const syllabusesPath = getStudentSyllabusesCollectionPath(
      selectedStudentId
    );

    await deleteDocument(
      syllabusesPath,
      requireNonEmptyString(syllabusId, "syllabusId")
    );

    const remainingSubscriptions = await readCollection(syllabusesPath);

    if (remainingSubscriptions.length === 0) {
      await deleteDocument(
        SYLLABUS_SUBSCRIPTIONS_COLLECTION,
        selectedStudentId
      );
    }
  }
}
