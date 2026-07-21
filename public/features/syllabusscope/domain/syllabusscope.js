export class SyllabusScope {
  constructor({
    id,
    country,
    languages = [],
    levels = {}
  }) {
    this.id = id;
    this.country = country;
    this.languages = languages;
    this.levels = levels;
  }

  update({
    country,
    languages,
    levels
  }) {
    if (country !== undefined) {
      this.country = country;
    }

    if (languages !== undefined) {
      this.languages = languages;
    }

    if (levels !== undefined) {
      this.levels = levels;
    }

    return this;
  }

  addLanguage(language) {
    const selectedLanguage = String(language || "").trim();

    if (!selectedLanguage) {
      throw new Error("language is required.");
    }

    const languageExists = this.languages.some(
      (item) => String(item).trim().toLowerCase() === selectedLanguage.toLowerCase()
    );

    if (!languageExists) {
      this.languages = [...this.languages, selectedLanguage];
    }

    return this;
  }

  deleteLanguage(language) {
    const selectedLanguage = String(language || "").trim();

    if (!selectedLanguage) {
      throw new Error("language is required.");
    }

    this.languages = this.languages.filter(
      (item) => String(item).trim().toLowerCase() !== selectedLanguage.toLowerCase()
    );

    return this;
  }
}
