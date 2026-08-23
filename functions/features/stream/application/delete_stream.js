class DeleteStream {
  constructor(streamRepository) {
    this.streamRepository = streamRepository;
  }

  async execute(streamId) {
    await this.streamRepository.delete(streamId);
  }
}

module.exports = {
  DeleteStream,
};
