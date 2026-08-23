export class GetStream {
  constructor(streamRepository) {
    this.streamRepository = streamRepository;
  }

  async execute(streamId) {
    return this.streamRepository.getById(streamId);
  }
}
