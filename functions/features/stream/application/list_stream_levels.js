const {
  listAvailableLevels,
  requireScope,
} = require("./stream_scope");

class ListStreamLevels {
  constructor(findSyllabusScopeByCountry) {
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
  }

  async execute(country) {
    const scope = requireScope(
      await this.findSyllabusScopeByCountry(country),
      country,
    );

    return listAvailableLevels(scope);
  }
}

module.exports = {
  ListStreamLevels,
};
