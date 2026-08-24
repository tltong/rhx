import {
  GuardianStudentLink
} from "../domain/guardian_student_link.js";

function filterByState(links, state) {
  if (state === undefined || state === null || state === "") {
    return links;
  }

  const normalizedState = String(state).trim().toLowerCase();

  if (!Object.values(GuardianStudentLink.States).includes(normalizedState)) {
    throw new Error(
      `state must be one of: ${Object.values(GuardianStudentLink.States).join(", ")}.`
    );
  }

  return links.filter((link) => link.state === normalizedState);
}

export class ListGuardianStudentLinks {
  constructor(guardianStudentLinkRepository) {
    this.guardianStudentLinkRepository = guardianStudentLinkRepository;
  }

  async byGuardian(guardianId, { state } = {}) {
    const links = await this.guardianStudentLinkRepository.listByGuardian(guardianId);

    return filterByState(links, state);
  }

  async byStudent(studentId, { state } = {}) {
    const links = await this.guardianStudentLinkRepository.listByStudent(studentId);

    return filterByState(links, state);
  }
}
