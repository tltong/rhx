function notFoundError() {
  const error = new Error("Guardian-student link was not found.");
  error.code = "guardian-student-link/not-found";
  return error;
}

export class UpdateGuardianStudentLink {
  constructor(guardianStudentLinkRepository, now = () => new Date()) {
    this.guardianStudentLinkRepository = guardianStudentLinkRepository;
    this.now = now;
  }

  async getRequiredLink(guardianId, studentId) {
    const link = await this.guardianStudentLinkRepository.get(guardianId, studentId);

    if (!link) {
      throw notFoundError();
    }

    return link;
  }

  async relationship({ guardianId, studentId, relationship }) {
    const link = await this.getRequiredLink(guardianId, studentId);

    link.updateRelationship(relationship, this.now());

    return this.guardianStudentLinkRepository.save(link);
  }

  async activate({ guardianId, studentId }) {
    const link = await this.getRequiredLink(guardianId, studentId);

    link.activate(this.now());

    return this.guardianStudentLinkRepository.save(link);
  }

  async deactivate({ guardianId, studentId }) {
    const link = await this.getRequiredLink(guardianId, studentId);

    link.deactivate(this.now());

    return this.guardianStudentLinkRepository.save(link);
  }
}
