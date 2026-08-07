class PreAssessmentQuestionRepository {
  async getById(syllabusId, topicId, questionId) {
    throw new Error("getById() is not implemented.");
  }

  async getManyById(questionReferences) {
    throw new Error("getManyById() is not implemented.");
  }
}

module.exports = {
  PreAssessmentQuestionRepository,
};
