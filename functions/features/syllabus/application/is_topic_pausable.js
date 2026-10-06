function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class IsTopicPausable {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId) {
    const normalizedSyllabusId = requireIdentifier(syllabusId, "syllabusId");
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const syllabus = await this.syllabusRepository.getById(normalizedSyllabusId);

    if (!syllabus) {
      throw new Error("Syllabus could not be found.");
    }

    const topic = syllabus.topics.find((item) => item.id === normalizedTopicId);

    if (!topic) {
      throw new Error("Syllabus topic could not be found.");
    }

    const pausable = topic.pausable === undefined ? true : topic.pausable;

    if (typeof pausable !== "boolean") {
      throw new Error("pausable must be a boolean.");
    }

    return pausable;
  }
}

module.exports = {IsTopicPausable};
