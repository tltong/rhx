class QuestionRepository {
  async getById(syllabusId, topicId, questionId) {
    throw new Error("getById() is not implemented.");
  }

  async listByTopic(syllabusId, topicId, options = {}) {
    throw new Error("listByTopic() is not implemented.");
  }

  async save(question) {
    throw new Error("save() is not implemented.");
  }

  async saveMany(questions) {
    throw new Error("saveMany() is not implemented.");
  }

  async delete(syllabusId, topicId, questionId) {
    throw new Error("delete() is not implemented.");
  }
}

module.exports = {
  QuestionRepository,
};
