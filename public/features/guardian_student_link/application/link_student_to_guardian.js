import { GuardianStudentLink } from "../domain/guardian_student_link.js";

export class LinkStudentToGuardian {
  constructor({
    guardianStudentLinkRepository,
    getGuardianById,
    getStudentById,
    now = () => new Date()
  }) {
    this.guardianStudentLinkRepository = guardianStudentLinkRepository;
    this.getGuardianById = getGuardianById;
    this.getStudentById = getStudentById;
    this.now = now;
  }

  async execute({ guardianId, studentId, relationship }) {
    const [guardian, student] = await Promise.all([
      this.getGuardianById(guardianId),
      this.getStudentById(studentId)
    ]);

    if (!guardian) {
      throw new Error("Guardian was not found.");
    }

    if (!student) {
      throw new Error("Student was not found.");
    }

    const now = this.now();
    const existingLink = await this.guardianStudentLinkRepository.get(
      guardianId,
      studentId
    );

    if (existingLink) {
      existingLink.updateRelationship(relationship, now).activate(now);

      return this.guardianStudentLinkRepository.save(existingLink);
    }

    return this.guardianStudentLinkRepository.save(new GuardianStudentLink({
      guardianId,
      studentId,
      relationship,
      state: GuardianStudentLink.States.ACTIVE,
      linkedAt: now,
      updatedAt: now
    }));
  }
}
