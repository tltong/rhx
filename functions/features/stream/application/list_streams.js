class ListStreams {
  constructor(streamRepository) {
    this.streamRepository = streamRepository;
  }

  async execute() {
    return this.streamRepository.list();
  }
}

module.exports = {
  ListStreams,
};
