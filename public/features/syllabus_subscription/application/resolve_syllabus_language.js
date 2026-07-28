function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

export async function resolveSyllabusLanguage({
  getSyllabusById,
  syllabusId,
  language
}) {
  const selectedSyllabusId = requireNonEmptyString(
    syllabusId,
    "syllabusId"
  );
  const selectedLanguage = requireNonEmptyString(language, "language");
  const syllabus = await getSyllabusById(selectedSyllabusId);

  if (!syllabus) {
    throw new Error(`Syllabus ${selectedSyllabusId} was not found.`);
  }

  const matchingLanguage = (syllabus.languages || []).find(
    (availableLanguage) =>
      String(availableLanguage).trim().toLowerCase() ===
      selectedLanguage.toLowerCase()
  );

  if (!matchingLanguage) {
    throw new Error(
      `${selectedLanguage} is not available for the selected syllabus.`
    );
  }

  return String(matchingLanguage).trim();
}
