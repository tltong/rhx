class RewardConfigRepository {
  async getGlobal() { throw new Error("RewardConfigRepository.getGlobal must be implemented."); }
  async saveGlobal(input) { throw new Error("RewardConfigRepository.saveGlobal must be implemented."); }
  async getFramework(scope) { throw new Error("RewardConfigRepository.getFramework must be implemented."); }
  async saveFramework(input) { throw new Error("RewardConfigRepository.saveFramework must be implemented."); }
}

module.exports = {RewardConfigRepository};
