class PracticeCompletionProcessingRepository {
  async markProcessing(input) {
    throw new Error("markProcessing() is not implemented.");
  }

  async markGenerating(input) {
    throw new Error("markGenerating() is not implemented.");
  }

  async markCompleted(input) {
    throw new Error("markCompleted() is not implemented.");
  }

  async markFailed(input) {
    throw new Error("markFailed() is not implemented.");
  }
}

module.exports = {
  PracticeCompletionProcessingRepository,
};
