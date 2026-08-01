export class LoadSyllabusPromptInstructionOptions {
  constructor(listSyllabuses) {
    this.listSyllabuses = listSyllabuses;
  }

  async execute() {
    const syllabuses = await this.listSyllabuses();

    return {
      syllabuses: syllabuses.map((syllabus) => ({
        id: syllabus.id,
        country: syllabus.country,
        level: syllabus.level,
        year: syllabus.year,
        subject: syllabus.subject,
        active: syllabus.active === true,
        topics: (syllabus.topics || []).map((topic) => ({
          id: topic.id,
          topicName: topic.topicName
        }))
      }))
    };
  }
}
