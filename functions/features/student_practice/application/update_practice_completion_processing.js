class UpdatePracticeCompletionProcessing {
  constructor({processingRepository} = {}) {
    if (
      !processingRepository
      || typeof processingRepository.markProcessing !== "function"
      || typeof processingRepository.markGenerating !== "function"
      || typeof processingRepository.markCompleted !== "function"
      || typeof processingRepository.markFailed !== "function"
    ) {
      throw new Error("processingRepository is required.");
    }

    this.processingRepository = processingRepository;
  }

  markProcessing(input) {
    return this.processingRepository.markProcessing(input);
  }

  markGenerating(input) {
    return this.processingRepository.markGenerating(input);
  }

  markCompleted(input) {
    return this.processingRepository.markCompleted(input);
  }

  markFailed(input) {
    return this.processingRepository.markFailed(input);
  }
}

module.exports = {
  UpdatePracticeCompletionProcessing,
};
