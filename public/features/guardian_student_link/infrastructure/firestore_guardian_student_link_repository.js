import {
  GUARDIAN_STUDENT_LINKS_COLLECTION
} from "../../../config/firebase/guardian_student_link_schema.js";
import {
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import { GuardianStudentLink } from "../domain/guardian_student_link.js";
import {
  GuardianStudentLinkRepository
} from "../domain/guardian_student_link_repository.js";

function requireId(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function buildLinkDocumentId(guardianId, studentId) {
  return `${encodeURIComponent(requireId(guardianId, "guardianId"))}__${
    encodeURIComponent(requireId(studentId, "studentId"))
  }`;
}

function toGuardianStudentLink(data) {
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
    updatedAt: data.updatedAt
  });
}

function toLinkRecord(link) {
  return {
    guardianId: link.guardianId,
    studentId: link.studentId,
    relationship: link.relationship,
    state: link.state,
    linkedAt: link.linkedAt,
    updatedAt: link.updatedAt
  };
}

function sortLinks(links, field) {
  return links.sort((first, second) => first[field].localeCompare(second[field]));
}

export class FirestoreGuardianStudentLinkRepository
  extends GuardianStudentLinkRepository {
  async get(guardianId, studentId) {
    const data = await readDocument(
      GUARDIAN_STUDENT_LINKS_COLLECTION,
      buildLinkDocumentId(guardianId, studentId)
    );

    return toGuardianStudentLink(data);
  }

  async listByGuardian(guardianId) {
    const normalizedGuardianId = requireId(guardianId, "guardianId");
    const records = await readCollection(
      GUARDIAN_STUDENT_LINKS_COLLECTION,
      (collection) => collection.where("guardianId", "==", normalizedGuardianId)
    );

    return sortLinks(records.map(toGuardianStudentLink).filter(Boolean), "studentId");
  }

  async listByStudent(studentId) {
    const normalizedStudentId = requireId(studentId, "studentId");
    const records = await readCollection(
      GUARDIAN_STUDENT_LINKS_COLLECTION,
      (collection) => collection.where("studentId", "==", normalizedStudentId)
    );

    return sortLinks(records.map(toGuardianStudentLink).filter(Boolean), "guardianId");
  }

  async save(link) {
    const documentId = buildLinkDocumentId(link.guardianId, link.studentId);

    await writeDocument(
      GUARDIAN_STUDENT_LINKS_COLLECTION,
      documentId,
      toLinkRecord(link),
      { merge: false }
    );

    link.id = documentId;

    return link;
  }

  async delete(guardianId, studentId) {
    return deleteDocument(
      GUARDIAN_STUDENT_LINKS_COLLECTION,
      buildLinkDocumentId(guardianId, studentId)
    );
  }
}
