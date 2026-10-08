class ReliabilityScoreRepository {
  async getTopic(scope) {
    throw new Error("ReliabilityScoreRepository.getTopic must be implemented.");
  }

  async saveTopic(input) {
    throw new Error("ReliabilityScoreRepository.saveTopic must be implemented.");
  }

  async getSubject(scope) {
    throw new Error("ReliabilityScoreRepository.getSubject must be implemented.");
  }

  async saveSubject(input) {
    throw new Error("ReliabilityScoreRepository.saveSubject must be implemented.");
  }
}

module.exports = {ReliabilityScoreRepository};
