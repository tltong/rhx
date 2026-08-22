class LoadLlmPromptGeneratorOptions {
  constructor({ listLlmPromptConfigs, listSyllabuses }) {
    this.listLlmPromptConfigs = listLlmPromptConfigs;
    this.listSyllabuses = listSyllabuses;
  }

  async execute() {
    const [configs, syllabuses] = await Promise.all([
      this.listLlmPromptConfigs(),
      this.listSyllabuses(),
    ]);

    return {
      promptConfigs: configs.map(({ id, identifier }) => ({ id, identifier })),
      syllabuses: syllabuses.map((syllabus) => ({
        id: syllabus.id,
        country: syllabus.country,
        level: syllabus.level,
        year: syllabus.year,
        subject: syllabus.subject,
        languages: [...syllabus.languages],
        topics: syllabus.topics.map((topic) => ({
          id: topic.id,
          topicName: topic.topicName,
          subtopics: { ...topic.subtopics },
        })),
        active: Boolean(syllabus.active),
      })),
    };
  }
}

module.exports = {
  LoadLlmPromptGeneratorOptions,
};
