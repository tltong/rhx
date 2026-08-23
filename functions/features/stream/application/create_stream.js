const { Stream } = require("../domain/stream");
const {
  requireAvailableLevel,
  requireScope,
} = require("./stream_scope");

class CreateStream {
  constructor({
    streamRepository,
    findSyllabusScopeByCountry,
    now = () => new Date(),
  }) {
    this.streamRepository = streamRepository;
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
    this.now = now;
  }

  async execute({name, country, level}) {
    const scope = requireScope(
      await this.findSyllabusScopeByCountry(country),
      country,
    );
    const selectedLevel = requireAvailableLevel(scope, level);
    const timestamp = this.now();
    const stream = new Stream({
      name,
      country: scope.country,
      level: selectedLevel,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return this.streamRepository.create(stream);
  }
}

module.exports = {
  CreateStream,
};
