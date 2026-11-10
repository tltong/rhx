import { getGuardianById } from "../guardian/guardian_module.js";
import {createStudentProfileFeature} from "../student/student_profile_module.js?v=20261110-student-profile-v1";
const backendLinks = createStudentProfileFeature();
export {confirmStudentLogin} from "./infrastructure/student_login_proof.js?v=20261110-student-login-proof-v1";
import {
  getStudentById,
  getStudentSummaryById
} from "../student/student_module.js?v=20261110-student-profile-v1";
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
  getStudentById: getStudentSummaryById
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
  return backendLinks.linkStudentToGuardian(input);
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
  return backendLinks.updateGuardianStudentLink(input);
}

async function activateGuardianStudentLink(input) {
  return backendLinks.updateGuardianStudentLink({...input, state: "active"});
}

async function deactivateGuardianStudentLink(input) {
  return backendLinks.updateGuardianStudentLink({...input, state: "inactive"});
}

async function unlinkStudentFromGuardian(input) {
  return backendLinks.unlinkStudentFromGuardian(input);
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
