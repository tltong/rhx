import { Stream } from "../domain/stream.js?v=20260823-stream-language-v1";
import {
  requireAvailableLevel,
  requireScope
} from "./stream_scope.js";

export class CreateStream {
  constructor({
    streamRepository,
    findSyllabusScopeByCountry,
    now = () => new Date()
  }) {
    this.streamRepository = streamRepository;
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
    this.now = now;
  }

  async execute({ name, country, level }) {
    const scope = requireScope(
      await this.findSyllabusScopeByCountry(country),
      country
    );
    const selectedLevel = requireAvailableLevel(scope, level);
    const timestamp = this.now();
    const stream = new Stream({
      name,
      country: scope.country,
      level: selectedLevel,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return this.streamRepository.create(stream);
  }
}
