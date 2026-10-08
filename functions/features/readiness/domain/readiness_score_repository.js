
class ReadinessScoreRepository {
  async get(scope) {
    throw new Error("ReadinessScoreRepository.get must be implemented.");
  }

  async save(input) {
    throw new Error("ReadinessScoreRepository.save must be implemented.");
  }

  async listHistory(scope) {
    throw new Error("ReadinessScoreRepository.listHistory must be implemented.");
  }

  async getSubject(scope) {
    throw new Error("ReadinessScoreRepository.getSubject must be implemented.");
  }

  async saveSubject(input) {
    throw new Error("ReadinessScoreRepository.saveSubject must be implemented.");
  }

  async listSubjectHistory(scope) {
    throw new Error("ReadinessScoreRepository.listSubjectHistory must be implemented.");
  }
}

module.exports = {ReadinessScoreRepository};
