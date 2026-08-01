function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

export async function requireSyllabusTopic(
  syllabusRepository,
  syllabusId,
  topicId
) {
  const normalizedSyllabusId = requireIdentifier(syllabusId, "syllabusId");
  const normalizedTopicId = requireIdentifier(topicId, "topicId");
  const syllabus = await syllabusRepository.getById(normalizedSyllabusId);

  if (!syllabus) {
    throw new Error("Syllabus could not be found.");
  }

  const topic = syllabus.topics.find(
    (item) => item.id === normalizedTopicId
  );

  if (!topic) {
    throw new Error("Syllabus topic could not be found.");
  }

  return {
    syllabus,
    topic
  };
}

export function requireSyllabusLanguage(syllabus, language) {
  const requestedLanguage = String(language ?? "").trim();

  if (!requestedLanguage) {
    throw new Error("language is required.");
  }

  const selectedLanguage = syllabus.languages.find(
    (item) => item.toLowerCase() === requestedLanguage.toLowerCase()
  );

  if (!selectedLanguage) {
    throw new Error("Language is not available for the syllabus.");
  }

  return selectedLanguage;
}
