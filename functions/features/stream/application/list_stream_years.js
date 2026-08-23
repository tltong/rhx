const {
  listAvailableYears,
  requireScope,
} = require("./stream_scope");

class ListStreamYears {
  constructor(findSyllabusScopeByCountry) {
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
  }

  async execute(country, level) {
    const scope = requireScope(
      await this.findSyllabusScopeByCountry(country),
      country,
    );

    return listAvailableYears(scope, level);
  }
}

module.exports = {
  ListStreamYears,
};
