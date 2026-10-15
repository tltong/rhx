class StudentLoginRepository {
  async record(input) { throw new Error("StudentLoginRepository.record must be implemented."); }
  async getSummary(input) { throw new Error("StudentLoginRepository.getSummary must be implemented."); }
  async getByDate(input) { throw new Error("StudentLoginRepository.getByDate must be implemented."); }
  async hasLoggedInOnDate(input) { throw new Error("StudentLoginRepository.hasLoggedInOnDate must be implemented."); }
  async listHistory(input) { throw new Error("StudentLoginRepository.listHistory must be implemented."); }
  async pruneHistory(input) { throw new Error("StudentLoginRepository.pruneHistory must be implemented."); }
}

module.exports = {StudentLoginRepository};
