function normalizeLanguage(language) {
  const normalizedLanguage = String(language ?? "").trim();

  if (!normalizedLanguage) {
    throw new Error("language is required.");
  }

  return normalizedLanguage;
}

export class SyllabusSubscription {
  constructor({
    studentId,
    syllabusId,
    language = null,
    state = "active",
    subscribedAt = null,
    updatedAt = null
  }) {
    this.studentId = studentId;
    this.syllabusId = syllabusId;
    this.language = language === null
      ? null
      : normalizeLanguage(language);
    this.state = state;
    this.subscribedAt = subscribedAt;
    this.updatedAt = updatedAt;
  }

  setLanguage(language) {
    this.language = normalizeLanguage(language);

    return this;
  }

  activate(updatedAt = new Date()) {
    this.state = "active";

    if (!this.subscribedAt) {
      this.subscribedAt = updatedAt;
    }

    this.updatedAt = updatedAt;

    return this;
  }

  deactivate(updatedAt = new Date()) {
    this.state = "inactive";

    if (!this.subscribedAt) {
      this.subscribedAt = updatedAt;
    }

    this.updatedAt = updatedAt;

    return this;
  }

  update({
    language,
    state,
    subscribedAt,
    updatedAt
  }) {
    if (language !== undefined) {
      this.language = language === null
        ? null
        : normalizeLanguage(language);
    }

    if (state !== undefined) {
      this.state = state;
    }

    if (subscribedAt !== undefined) {
      this.subscribedAt = subscribedAt;
    }

    if (updatedAt !== undefined) {
      this.updatedAt = updatedAt;
    }

    return this;
  }
}
