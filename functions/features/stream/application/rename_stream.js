class RenameStream {
  constructor({
    streamRepository,
    now = () => new Date(),
  }) {
    this.streamRepository = streamRepository;
    this.now = now;
  }

  async execute(streamId, name) {
    const stream = await this.streamRepository.getById(streamId);

    if (!stream) {
      throw new Error("Stream could not be found.");
    }

    stream.rename(name, this.now());

    return this.streamRepository.save(stream);
  }
}

module.exports = {
  RenameStream,
};
