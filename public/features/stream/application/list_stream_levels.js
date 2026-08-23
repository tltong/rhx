import {
  listAvailableLevels,
  requireScope
} from "./stream_scope.js";

export class ListStreamLevels {
  constructor(findSyllabusScopeByCountry) {
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
  }

  async execute(country) {
    const scope = requireScope(
      await this.findSyllabusScopeByCountry(country),
      country
    );

    return listAvailableLevels(scope);
  }
}
