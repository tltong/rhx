export class UnlinkStudentFromGuardian {
  constructor(guardianStudentLinkRepository) {
    this.guardianStudentLinkRepository = guardianStudentLinkRepository;
  }

  async execute({ guardianId, studentId }) {
    await this.guardianStudentLinkRepository.delete(guardianId, studentId);

    return {
      guardianId,
      studentId,
      deleted: true
    };
  }
}
