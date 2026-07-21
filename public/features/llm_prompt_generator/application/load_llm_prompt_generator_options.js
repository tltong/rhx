function toPromptConfigOption(promptConfig) {
  return {
    id: promptConfig.id,
    identifier: promptConfig.identifier
  };
}

function toSyllabusOption(syllabus) {
  return {
    id: syllabus.id,
    country: syllabus.country,
    level: syllabus.level,
    year: syllabus.year,
    subject: syllabus.subject,
    languages: Array.isArray(syllabus.languages)
      ? [...syllabus.languages]
      : [],
    topics: Array.isArray(syllabus.topics)
      ? syllabus.topics.map((topic) => ({
        id: topic.id,
        topicName: topic.topicName,
        subtopics: { ...(topic.subtopics || {}) }
      }))
      : [],
    active: Boolean(syllabus.active)
  };
}

export class LoadLlmPromptGeneratorOptions {
  constructor({
    listLlmPromptConfigs,
    listSyllabuses
  }) {
    this.listLlmPromptConfigs = listLlmPromptConfigs;
    this.listSyllabuses = listSyllabuses;
  }

  async execute() {
    const [promptConfigs, syllabuses] = await Promise.all([
      this.listLlmPromptConfigs(),
      this.listSyllabuses()
    ]);

    return {
      promptConfigs: promptConfigs.map(toPromptConfigOption),
      syllabuses: syllabuses.map(toSyllabusOption)
    };
  }
}
