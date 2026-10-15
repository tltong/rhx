class StudentRewardRepository {
  async save(input) { throw new Error("StudentRewardRepository.save must be implemented."); }
  // Internal lookup for retrying reward processing; not a feature API.
  async saveAssessmentLevelAwards(input) { throw new Error("StudentRewardRepository.saveAssessmentLevelAwards must be implemented."); }
  async getById(input) { throw new Error("StudentRewardRepository.getById must be implemented."); }
  async getTotal(input) { throw new Error("StudentRewardRepository.getTotal must be implemented."); }
  watchTotal(input) { throw new Error("StudentRewardRepository.watchTotal must be implemented."); }
  async getCategoryTotal(input) { throw new Error("StudentRewardRepository.getCategoryTotal must be implemented."); }
  async listHistory(input) { throw new Error("StudentRewardRepository.listHistory must be implemented."); }
  async listRecentActivities(input) { throw new Error("StudentRewardRepository.listRecentActivities must be implemented."); }
}

export {StudentRewardRepository};
