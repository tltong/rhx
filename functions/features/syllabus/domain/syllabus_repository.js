class SyllabusRepository {
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
