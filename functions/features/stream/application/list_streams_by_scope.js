function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

class ListStreamsByScope {
  constructor(streamRepository) {
    this.streamRepository = streamRepository;
  }

  async execute(country, level, year) {
    const selectedCountry = requireText(country, "country");
    const selectedLevel = requireText(level, "level").toLowerCase();
    const selectedYear = Number(year);

    if (!Number.isInteger(selectedYear) || selectedYear < 1) {
      throw new Error("year must be a positive integer.");
    }

    const streams = await this.streamRepository.list();

    return streams.filter((stream) => (
      stream.country.localeCompare(selectedCountry, undefined, {
        sensitivity: "accent",
      }) === 0 && stream.level.toLowerCase() === selectedLevel &&
      Boolean(stream.getYearAssignment(selectedYear))
    ));
  }
}

module.exports = {
  ListStreamsByScope,
};