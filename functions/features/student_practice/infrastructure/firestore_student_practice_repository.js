const {
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION,
} = require("../../../schema/student_practice_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  StudentPracticeAssignment,
} = require("../domain/student_practice_assignment");
const {
  StudentPracticeRepository,
} = require("../domain/student_practice_repository");

function assignedPracticesCollectionPath(studentId) {
  return [
    STUDENT_PRACTICES_COLLECTION,
    studentId,
    ASSIGNED_PRACTICES_SUBCOLLECTION,
  ].join("/");
}

class FirestoreStudentPracticeRepository extends StudentPracticeRepository {
  constructor({
    writeDocument = firebaseOps.writeDocument,
  } = {}) {
    super();
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
}

module.exports = {
  FirestoreStudentPracticeRepository,
};
