function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

export async function requireSyllabus(getSyllabusById, syllabusId) {
  const id = requireIdentifier(syllabusId, "syllabusId");
  const syllabus = await getSyllabusById(id);

  if (!syllabus) {
    throw new Error("Syllabus could not be found.");
  }

  return syllabus;
}

export async function requireSyllabusTopic(
  getSyllabusById,
  syllabusId,
  topicId
) {
  const syllabus = await requireSyllabus(getSyllabusById, syllabusId);
  const id = requireIdentifier(topicId, "topicId");
  const topic = (syllabus.topics || []).find((item) => item.id === id);

  if (!topic) {
    throw new Error("Topic does not belong to the selected syllabus.");
  }

  return {
    syllabus,
    topic
  };
}
