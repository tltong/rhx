import { getGuardianById } from "../guardian/guardian_module.js";
import {
  getStudentById,
  getStudentSummaryById
} from "../student/student_module.js?v=20260825-guardian-student-search-v1";
import {
  GetGuardianStudentLink
} from "./application/get_guardian_student_link.js";
import {
  LinkStudentToGuardian
} from "./application/link_student_to_guardian.js";
import {
  ListGuardianStudentLinks
} from "./application/list_guardian_student_links.js";
import {
  ListLinkedStudentsForGuardian
} from "./application/list_linked_students_for_guardian.js";
import {
  UnlinkStudentFromGuardian
} from "./application/unlink_student_from_guardian.js";
import {
  UpdateGuardianStudentLink
} from "./application/update_guardian_student_link.js";
import {
  guardianStudentLinkStates,
  guardianStudentRelationships
} from "./domain/guardian_student_link.js";
import {
  FirestoreGuardianStudentLinkRepository
} from "./infrastructure/firestore_guardian_student_link_repository.js";

const guardianStudentLinkRepository = new FirestoreGuardianStudentLinkRepository();
const getGuardianStudentLinkUseCase = new GetGuardianStudentLink(
  guardianStudentLinkRepository
);
const linkStudentToGuardianUseCase = new LinkStudentToGuardian({
  guardianStudentLinkRepository,
  getGuardianById,
  getStudentById
});
const listGuardianStudentLinksUseCase = new ListGuardianStudentLinks(
  guardianStudentLinkRepository
);
const listLinkedStudentsForGuardianUseCase = new ListLinkedStudentsForGuardian({
  guardianStudentLinkRepository,
  getStudentSummaryById
});
const updateGuardianStudentLinkUseCase = new UpdateGuardianStudentLink(
  guardianStudentLinkRepository
);
const unlinkStudentFromGuardianUseCase = new UnlinkStudentFromGuardian(
  guardianStudentLinkRepository
);

async function linkStudentToGuardian(input) {
  return linkStudentToGuardianUseCase.execute(input);
}

async function getGuardianStudentLink(input) {
  return getGuardianStudentLinkUseCase.execute(input);
}

async function listGuardianStudentLinksByGuardian(guardianId, options) {
  return listGuardianStudentLinksUseCase.byGuardian(guardianId, options);
}

async function listGuardianStudentLinksByStudent(studentId, options) {
  return listGuardianStudentLinksUseCase.byStudent(studentId, options);
}

/**
 * @param {string} guardianId
 * @param {{state?: string}} [options]
 * @returns {Promise<Array<{
 *   link: import("./domain/guardian_student_link.js").GuardianStudentLink,
 *   student: {id: string, name: string, yearOfBirth: number, level: string, grade: number}|null
 * }>>}
 */
async function listLinkedStudentsForGuardian(guardianId, options) {
  return listLinkedStudentsForGuardianUseCase.execute(guardianId, options);
}

async function updateGuardianStudentRelationship(input) {
  return updateGuardianStudentLinkUseCase.relationship(input);
}

async function activateGuardianStudentLink(input) {
  return updateGuardianStudentLinkUseCase.activate(input);
}

async function deactivateGuardianStudentLink(input) {
  return updateGuardianStudentLinkUseCase.deactivate(input);
}

async function unlinkStudentFromGuardian(input) {
  return unlinkStudentFromGuardianUseCase.execute(input);
}

export {
  activateGuardianStudentLink,
  deactivateGuardianStudentLink,
  getGuardianStudentLink,
  guardianStudentLinkStates,
  guardianStudentRelationships,
  linkStudentToGuardian,
  listGuardianStudentLinksByGuardian,
  listGuardianStudentLinksByStudent,
  listLinkedStudentsForGuardian,
  unlinkStudentFromGuardian,
  updateGuardianStudentRelationship
};
