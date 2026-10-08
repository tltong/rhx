class ReliabilityConfigRepository {
  async get() {
    throw new Error("ReliabilityConfigRepository.get must be implemented.");
  }

  async save(input) {
    throw new Error("ReliabilityConfigRepository.save must be implemented.");
  }
}

export {ReliabilityConfigRepository};
