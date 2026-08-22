export function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

export function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

export function toDate(value, fieldName) {
  const dateValue = value && typeof value.toDate === "function"
    ? value.toDate()
    : value;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

export function getPracticeScope(practice) {
  if (!practice || !Array.isArray(practice.questions)
    || practice.questions.length === 0) {
    throw new Error("Practice must contain at least one question.");
  }

  const syllabusIds = new Set(
    practice.questions.map((question) => question.syllabusId)
  );
  const topicIds = new Set(
    practice.questions.map((question) => question.topicId)
  );

  if (syllabusIds.size !== 1 || topicIds.size !== 1) {
    throw new Error(
      "An assessed practice must contain questions for exactly one syllabus and topic."
    );
  }

  return Object.freeze({
    syllabusId: requireIdentifier([...syllabusIds][0], "syllabusId"),
    topicId: requireIdentifier([...topicIds][0], "topicId")
  });
}

export function practiceMatchesScope(
  practice,
  practiceType,
  syllabusId,
  topicId
) {
  return practice?.type === practiceType
    && Array.isArray(practice.questions)
    && practice.questions.length > 0
    && practice.questions.every((question) =>
      question.syllabusId === syllabusId && question.topicId === topicId
    );
}

export async function requireSyllabusTopic(
  getSyllabusById,
  syllabusId,
  topicId
) {
  const syllabus = await getSyllabusById(syllabusId);

  if (!syllabus) {
    throw new Error(`Syllabus ${syllabusId} was not found.`);
  }

  if (!syllabus.topics.some((topic) => topic.id === topicId)) {
    throw new Error(`Topic ${topicId} was not found in syllabus ${syllabusId}.`);
  }

  return syllabus;
}
