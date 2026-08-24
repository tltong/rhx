export class GetGuardianStudentLink {
  constructor(guardianStudentLinkRepository) {
    this.guardianStudentLinkRepository = guardianStudentLinkRepository;
  }

  async execute({ guardianId, studentId }) {
    return this.guardianStudentLinkRepository.get(guardianId, studentId);
  }
}
