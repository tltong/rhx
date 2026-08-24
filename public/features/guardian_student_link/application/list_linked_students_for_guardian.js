import { GuardianStudentLink } from "../domain/guardian_student_link.js";

export class ListLinkedStudentsForGuardian {
  constructor({ guardianStudentLinkRepository, getStudentSummaryById }) {
    this.guardianStudentLinkRepository = guardianStudentLinkRepository;
    this.getStudentSummaryById = getStudentSummaryById;
  }

  async execute(
    guardianId,
    { state = GuardianStudentLink.States.ACTIVE } = {}
  ) {
    const links = await this.guardianStudentLinkRepository.listByGuardian(guardianId);
    const normalizedState = String(state ?? "").trim().toLowerCase();

    if (!Object.values(GuardianStudentLink.States).includes(normalizedState)) {
      throw new Error(
        `state must be one of: ${Object.values(GuardianStudentLink.States).join(", ")}.`
      );
    }

    return Promise.all(links
      .filter((link) => link.state === normalizedState)
      .map(async (link) => ({
        link,
        student: await this.getStudentSummaryById(link.studentId)
      })));
  }
}
