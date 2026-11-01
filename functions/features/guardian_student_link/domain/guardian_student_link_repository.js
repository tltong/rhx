class GuardianStudentLinkRepository {
  async listByGuardian(_guardianId) {
    throw new Error("listByGuardian() is not implemented.");
  }
  async get(_guardianId, _studentId) {
    throw new Error("get() is not implemented.");
  }
}

module.exports = {GuardianStudentLinkRepository};
