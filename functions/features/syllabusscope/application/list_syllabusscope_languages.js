class ListSyllabusScopeLanguages {
  constructor(syllabusScopeRepository) {
    this.syllabusScopeRepository = syllabusScopeRepository;
  }

  async execute() {
    const scopes = await this.syllabusScopeRepository.list();
    const languages = new Map();

    scopes.forEach((scope) => {
      (scope.languages || []).forEach((value) => {
        const language = typeof value === "string" ? value.trim() : "";
        const languageKey = language.toLowerCase();

        if (language && !languages.has(languageKey)) {
          languages.set(languageKey, language);
        }
      });
    });

    return [...languages.values()].sort((first, second) => (
      first.localeCompare(second)
    ));
  }
}

module.exports = {ListSyllabusScopeLanguages};

