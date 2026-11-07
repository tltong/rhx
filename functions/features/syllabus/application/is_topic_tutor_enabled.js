class IsTopicTutorEnabled {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId, topicId) {
    const syllabusKey = String(syllabusId ?? "").trim();
    const topicKey = String(topicId ?? "").trim();
    if (!syllabusKey) throw new Error("syllabusId is required.");
    if (!topicKey) throw new Error("topicId is required.");
    const syllabus = await this.syllabusRepository.getById(syllabusKey);
    if (!syllabus) throw new Error("Syllabus could not be found.");
    const topic = syllabus.topics.find(item => item.id === topicKey);
    if (!topic) throw new Error("Syllabus topic could not be found.");
    const enabled = topic.tutorEnabled === undefined ? true : topic.tutorEnabled;
    if (typeof enabled !== "boolean") throw new Error("tutorEnabled must be a boolean.");
    return enabled;
  }
}

module.exports = {IsTopicTutorEnabled};
