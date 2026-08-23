const {
  StreamSubscription,
} = require("../domain/stream_subscription");

class SubscribeStudentToStream {
  constructor({streamSubscriptionRepository, getStreamById}) {
    this.streamSubscriptionRepository = streamSubscriptionRepository;
    this.getStreamById = getStreamById;
  }

  async execute(studentId, streamId) {
    const stream = await this.getStreamById(streamId);

    if (!stream) {
      throw new Error("Stream could not be found.");
    }

    const subscription = new StreamSubscription({
      studentId,
      streamId: stream.id,
    });

    await this.streamSubscriptionRepository.save(subscription);

    return subscription;
  }
}

module.exports = {
  SubscribeStudentToStream,
};
