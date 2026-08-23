export class ListStreamCountries {
  constructor(listSyllabusScopes) {
    this.listSyllabusScopes = listSyllabusScopes;
  }

  async execute() {
    const scopes = await this.listSyllabusScopes();
    const countries = new Map();

    scopes.forEach((scope) => {
      const country = String(scope?.country ?? "").trim();
      const key = country.normalize("NFKC").toLowerCase();

      if (country && !countries.has(key)) {
        countries.set(key, country);
      }
    });

    return [...countries.values()].sort((first, second) => (
      first.localeCompare(second)
    ));
  }
}
