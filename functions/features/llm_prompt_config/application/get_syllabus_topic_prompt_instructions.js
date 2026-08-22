class GetSyllabusTopicPromptInstructions {
  constructor(repository, getSyllabusById) {
    this.repository = repository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(syllabusId, topicId) {
    const selectedSyllabusId = String(syllabusId || "").trim();
    const selectedTopicId = String(topicId || "").trim();

    if (!selectedSyllabusId) {
      throw new Error("syllabusId is required.");
    }

    if (!selectedTopicId) {
      throw new Error("topicId is required.");
    }

    const syllabus = await this.getSyllabusById(selectedSyllabusId);

    if (!syllabus) {
      throw new Error("Syllabus could not be found.");
    }

    const topic = syllabus.topics.find(({ id }) => id === selectedTopicId);

    if (!topic) {
      throw new Error("Topic does not belong to the selected syllabus.");
    }

    const [syllabusInstructions, topicInstructions] = await Promise.all([
      this.repository.getSyllabusInstructions(syllabus.id),
      this.repository.getTopicInstructions(syllabus.id, topic.id),
    ]);

    return {
      syllabusId: syllabus.id,
      topicId: topic.id,
      syllabusAdditionalInstructions: syllabusInstructions,
      topicAdditionalInstructions: topicInstructions,
    };
  }
}

module.exports = {
  GetSyllabusTopicPromptInstructions,
};
