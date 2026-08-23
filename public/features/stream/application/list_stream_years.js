import {
  listAvailableYears,
  requireScope
} from "./stream_scope.js";

export class ListStreamYears {
  constructor(findSyllabusScopeByCountry) {
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
  }

  async execute(country, level) {
    const scope = requireScope(
      await this.findSyllabusScopeByCountry(country),
      country
    );

    return listAvailableYears(scope, level);
  }
}
