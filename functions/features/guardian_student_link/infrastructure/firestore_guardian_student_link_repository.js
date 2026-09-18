const {
  GUARDIAN_STUDENT_LINKS_COLLECTION,
} = require("../../../schema/guardian_student_link_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  GuardianStudentLink,
} = require("../domain/guardian_student_link");
const {
  GuardianStudentLinkRepository,
} = require("../domain/guardian_student_link_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function buildGuardianStudentLinkDocumentId(guardianId, studentId) {
  return `${encodeURIComponent(requireIdentifier(guardianId, "guardianId"))}__${
    encodeURIComponent(requireIdentifier(studentId, "studentId"))
  }`;
}

class FirestoreGuardianStudentLinkRepository
  extends GuardianStudentLinkRepository {
  constructor({readDocument = firebaseOps.readDocument} = {}) {
    super();
    this.readDocument = readDocument;
  }

  async get(guardianId, studentId) {
    const data = await this.readDocument(
      GUARDIAN_STUDENT_LINKS_COLLECTION,
      buildGuardianStudentLinkDocumentId(guardianId, studentId),
    );

    if (!data) {
      return null;
    }

    return new GuardianStudentLink({
      id: data.id,
      guardianId: data.guardianId,
      studentId: data.studentId,
      relationship: data.relationship,
      state: data.state,
      linkedAt: data.linkedAt,
      updatedAt: data.updatedAt,
    });
  }
}

module.exports = {
  buildGuardianStudentLinkDocumentId,
  FirestoreGuardianStudentLinkRepository,
};
