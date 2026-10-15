class TutorConfigRepository {
  async get() {
    throw new Error("TutorConfigRepository.get must be implemented.");
  }

  async save(input) {
    throw new Error("TutorConfigRepository.save must be implemented.");
  }
}

module.exports = {TutorConfigRepository};

