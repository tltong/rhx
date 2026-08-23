function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function normalizeYear(value) {
  const year = Number(value);

  if (!Number.isInteger(year) || year < 1) {
    throw new Error("year must be a positive integer.");
  }

  return year;
}

function normalizeDate(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  const dateValue = value && typeof value.toDate === "function"
    ? value.toDate()
    : value;
  const date = dateValue instanceof Date
    ? new Date(dateValue.getTime())
    : new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

class StreamSyllabusAssignment {
  constructor({ syllabusId, language }) {
    this.syllabusId = requireText(syllabusId, "syllabusId");
    this.language = String(language ?? "").trim();
  }

  setLanguage(language) {
    this.language = requireText(language, "language");
    return this;
  }
}

function normalizeSyllabuses(syllabuses = []) {
  if (!Array.isArray(syllabuses)) {
    throw new Error("syllabuses must be an array.");
  }

  const assignments = new Map();

  syllabuses.forEach((value) => {
    const assignment = value instanceof StreamSyllabusAssignment
      ? value
      : new StreamSyllabusAssignment(value);

    assignments.set(assignment.syllabusId, assignment);
  });

  return [...assignments.values()];
}

class StreamYearAssignment {
  constructor({
    year,
    syllabuses = []
  }) {
    this.year = normalizeYear(year);
    this.syllabuses = normalizeSyllabuses(syllabuses);
  }

  get syllabusIds() {
    return this.syllabuses.map((assignment) => assignment.syllabusId);
  }

  getSyllabus(syllabusId) {
    const id = requireText(syllabusId, "syllabusId");

    return this.syllabuses.find((assignment) => (
      assignment.syllabusId === id
    )) || null;
  }

  addSyllabus(syllabusId, language) {
    const id = requireText(syllabusId, "syllabusId");
    const selectedLanguage = requireText(language, "language");
    const existingAssignment = this.getSyllabus(id);

    if (existingAssignment) {
      existingAssignment.setLanguage(selectedLanguage);
      return existingAssignment;
    }

    const assignment = new StreamSyllabusAssignment({
      syllabusId: id,
      language: selectedLanguage
    });
    this.syllabuses = [...this.syllabuses, assignment];

    return assignment;
  }

  removeSyllabus(syllabusId) {
    const id = requireText(syllabusId, "syllabusId");

    this.syllabuses = this.syllabuses.filter((assignment) => (
      assignment.syllabusId !== id
    ));

    return this;
  }
}

class Stream {
  constructor({
    id = null,
    name,
    country,
    level,
    createdAt = null,
    updatedAt = null,
    years = []
  }) {
    if (!Array.isArray(years)) {
      throw new Error("years must be an array.");
    }

    this.id = id === null ? null : requireText(id, "streamId");
    this.name = requireText(name, "name");
    this.country = requireText(country, "country");
    this.level = requireText(level, "level").toLowerCase();
    this.createdAt = normalizeDate(createdAt, "createdAt");
    this.updatedAt = normalizeDate(updatedAt, "updatedAt");
    this.years = years
      .map((assignment) => assignment instanceof StreamYearAssignment
        ? assignment
        : new StreamYearAssignment(assignment))
      .sort((first, second) => first.year - second.year);
  }

  rename(name, updatedAt = new Date()) {
    this.name = requireText(name, "name");
    this.updatedAt = normalizeDate(updatedAt, "updatedAt");

    return this;
  }

  getYearAssignment(year) {
    const selectedYear = normalizeYear(year);

    return this.years.find((assignment) => (
      assignment.year === selectedYear
    )) || null;
  }

  attachSyllabus(year, syllabusId, language, updatedAt = new Date()) {
    const selectedYear = normalizeYear(year);
    let assignment = this.getYearAssignment(selectedYear);

    if (!assignment) {
      assignment = new StreamYearAssignment({
        year: selectedYear,
        syllabuses: []
      });
      this.years = [...this.years, assignment]
        .sort((first, second) => first.year - second.year);
    }

    assignment.addSyllabus(syllabusId, language);
    this.updatedAt = normalizeDate(updatedAt, "updatedAt");

    return assignment;
  }

  detachSyllabus(year, syllabusId, updatedAt = new Date()) {
    const selectedYear = normalizeYear(year);
    const assignment = this.getYearAssignment(selectedYear);

    if (!assignment) {
      return null;
    }

    assignment.removeSyllabus(syllabusId);
    this.updatedAt = normalizeDate(updatedAt, "updatedAt");

    if (assignment.syllabuses.length === 0) {
      this.years = this.years.filter((item) => item.year !== selectedYear);
      return null;
    }

    return assignment;
  }

  hasAssignments() {
    return this.years.some((assignment) => assignment.syllabuses.length > 0);
  }
}
module.exports = {
  Stream,
  StreamSyllabusAssignment,
  StreamYearAssignment,
};