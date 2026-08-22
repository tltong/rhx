class QuestionRepository {
  async getById(questionReference) {
    throw new Error("getById() is not implemented.");
  }

  async getManyById(questionReferences) {
    throw new Error("getManyById() is not implemented.");
  }

  async countByGroup(questionGroup) {
    throw new Error("countByGroup() is not implemented.");
  }

  async listIdsByGroup(questionGroup) {
    throw new Error("listIdsByGroup() is not implemented.");
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

  async delete(questionReference) {
    throw new Error("delete() is not implemented.");
  }
}

module.exports = {
  QuestionRepository,
};
