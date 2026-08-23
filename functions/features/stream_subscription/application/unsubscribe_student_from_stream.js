class UnsubscribeStudentFromStream {
  constructor(streamSubscriptionRepository) {
    this.streamSubscriptionRepository = streamSubscriptionRepository;
  }

  async execute(studentId) {
    await this.streamSubscriptionRepository.delete(studentId);
  }
}

module.exports = {
  UnsubscribeStudentFromStream,
};
