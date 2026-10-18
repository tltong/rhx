class SyllabusRepository {
  async assignPreAssessmentPractice(syllabusId, topicId, assignment) {
    throw new Error("assignPreAssessmentPractice() is not implemented.");
  }

  async getById(syllabusId) {
    throw new Error("getById() is not implemented.");
  }

  async list() {
    throw new Error("list() is not implemented.");
  }
}

module.exports = {
  SyllabusRepository,
};
