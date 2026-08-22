const {
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  COMPLETED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION,
} = require("../../../schema/student_practice_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  StudentPracticeAssignment,
} = require("../domain/student_practice_assignment");
const {
  StudentPracticeCompletion,
} = require("../domain/student_practice_completion");
const {
  StudentPracticeRepository,
} = require("../domain/student_practice_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function assignedPracticesCollectionPath(studentId) {
  return [
    STUDENT_PRACTICES_COLLECTION,
    studentId,
    ASSIGNED_PRACTICES_SUBCOLLECTION,
  ].join("/");
}

function completedPracticesCollectionPath(studentId) {
  return [
    STUDENT_PRACTICES_COLLECTION,
    studentId,
    COMPLETED_PRACTICES_SUBCOLLECTION,
  ].join("/");
}

function sortPracticeIds(practiceIds) {
  return [...practiceIds].sort((first, second) =>
    first.localeCompare(second),
  );
}

function toCompletionRecord(completion) {
  return {
    dateCompleted: completion.dateCompleted,
    questionsCorrect: completion.questionsCorrect,
    totalQuestions: completion.totalQuestions,
    score: completion.score,
    timeTakenSeconds: completion.timeTakenSeconds,
    studentAnswers: completion.studentAnswers,
  };
}

class FirestoreStudentPracticeRepository extends StudentPracticeRepository {
  constructor({
    deleteDocument = firebaseOps.deleteDocument,
    getDocumentRef = firebaseOps.getDocumentRef,
    getFirestoreDb = firebaseOps.getFirestoreDb,
    readCollectionIds = firebaseOps.readCollectionIds,
    readDocument = firebaseOps.readDocument,
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
    this.deleteDocument = deleteDocument;
    this.getDocumentRef = getDocumentRef;
    this.getFirestoreDb = getFirestoreDb;
    this.readCollectionIds = readCollectionIds;
    this.readDocument = readDocument;
    this.writeDocument = writeDocument;
  }

  async assign(assignment) {
    const normalizedAssignment = assignment instanceof StudentPracticeAssignment
      ? assignment
      : new StudentPracticeAssignment(assignment);

    await this.writeDocument(
      STUDENT_PRACTICES_COLLECTION,
      normalizedAssignment.studentId,
      {},
      { merge: true },
    );
    await this.writeDocument(
      assignedPracticesCollectionPath(normalizedAssignment.studentId),
      normalizedAssignment.practiceId,
      {},
      { merge: false },
    );

    return normalizedAssignment;
  }

  async complete(completion) {
    const normalizedCompletion = completion instanceof StudentPracticeCompletion
      ? completion
      : new StudentPracticeCompletion(completion);
    const assignedDocument = this.getDocumentRef(
      assignedPracticesCollectionPath(normalizedCompletion.studentId),
      normalizedCompletion.practiceId,
    );
    const completedDocument = this.getDocumentRef(
      completedPracticesCollectionPath(normalizedCompletion.studentId),
      normalizedCompletion.practiceId,
    );

    await this.getFirestoreDb().runTransaction(async (transaction) => {
      const completedSnapshot = await transaction.get(completedDocument);

      if (completedSnapshot.exists) {
        transaction.delete(assignedDocument);
        return;
      }

      const assignedSnapshot = await transaction.get(assignedDocument);

      if (!assignedSnapshot.exists) {
        throw new Error(
          `Practice ${normalizedCompletion.practiceId} is not assigned.`,
        );
      }

      transaction.set(
        completedDocument,
        toCompletionRecord(normalizedCompletion),
      );
      transaction.delete(assignedDocument);
    });

    return normalizedCompletion;
  }

  async get(assignment) {
    const normalizedAssignment = assignment instanceof StudentPracticeAssignment
      ? assignment
      : new StudentPracticeAssignment(assignment);
    const data = await this.readDocument(
      assignedPracticesCollectionPath(normalizedAssignment.studentId),
      normalizedAssignment.practiceId,
    );

    return data ? normalizedAssignment : null;
  }

  async listAssignedIds(studentId) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");

    return sortPracticeIds(await this.readCollectionIds(
      assignedPracticesCollectionPath(normalizedStudentId),
    ));
  }

  async listCompletedIds(studentId) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");

    return sortPracticeIds(await this.readCollectionIds(
      completedPracticesCollectionPath(normalizedStudentId),
    ));
  }

  async remove(assignment) {
    const normalizedAssignment = assignment instanceof StudentPracticeAssignment
      ? assignment
      : new StudentPracticeAssignment(assignment);

    await this.deleteDocument(
      assignedPracticesCollectionPath(normalizedAssignment.studentId),
      normalizedAssignment.practiceId,
    );

    return normalizedAssignment;
  }
}

module.exports = {
  FirestoreStudentPracticeRepository,
};
