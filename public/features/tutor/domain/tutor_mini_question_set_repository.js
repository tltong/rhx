class TutorMiniQuestionSetRepository {
  async get(reference, options = {}) {
    throw new Error("TutorMiniQuestionSetRepository.get must be implemented.");
  }

  async save(input, options = {}) {
    throw new Error("TutorMiniQuestionSetRepository.save must be implemented.");
  }
}

export {TutorMiniQuestionSetRepository};
