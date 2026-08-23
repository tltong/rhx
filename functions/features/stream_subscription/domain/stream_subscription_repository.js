class StreamSubscriptionRepository {
  async getByStudentId(studentId) {
    throw new Error("getByStudentId() is not implemented.");
  }

  async save(streamSubscription) {
    throw new Error("save() is not implemented.");
  }

  async delete(studentId) {
    throw new Error("delete() is not implemented.");
  }
}

module.exports = {
  StreamSubscriptionRepository,
};
