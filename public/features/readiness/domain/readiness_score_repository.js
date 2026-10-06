
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
}

export {ReadinessScoreRepository};

