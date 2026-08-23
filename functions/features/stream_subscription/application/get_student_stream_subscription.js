class GetStudentStreamSubscription {
  constructor(streamSubscriptionRepository) {
    this.streamSubscriptionRepository = streamSubscriptionRepository;
  }

  async execute(studentId) {
    return this.streamSubscriptionRepository.getByStudentId(studentId);
  }
}

module.exports = {
  GetStudentStreamSubscription,
};
