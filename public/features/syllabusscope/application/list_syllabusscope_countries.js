function normalizeCountry(country) {
  return String(country ?? "").trim();
}

export class ListSyllabusScopeCountries {
  constructor(syllabusScopeRepository) {
    this.syllabusScopeRepository = syllabusScopeRepository;
  }

  async execute() {
    const scopes = await this.syllabusScopeRepository.list();
    const countries = new Map();

    scopes.forEach((scope) => {
      const country = normalizeCountry(scope?.country);

      const countryKey = country.toLocaleLowerCase();

      if (country && !countries.has(countryKey)) {
        countries.set(countryKey, country);
      }
    });

    return [...countries.values()].sort((first, second) => (
      first.localeCompare(second)
    ));
  }
}