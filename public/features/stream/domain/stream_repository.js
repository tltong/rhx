export class StreamRepository {
  async getById(streamId) {
    throw new Error("getById() is not implemented.");
  }

  async list() {
    throw new Error("list() is not implemented.");
  }

  async create(stream) {
    throw new Error("create() is not implemented.");
  }

  async save(stream) {
    throw new Error("save() is not implemented.");
  }

  async saveYearAssignment(streamId, assignment) {
    throw new Error("saveYearAssignment() is not implemented.");
  }

  async deleteYearAssignment(streamId, year) {
    throw new Error("deleteYearAssignment() is not implemented.");
  }

  async delete(streamId) {
    throw new Error("delete() is not implemented.");
  }
}
