export class ListDiagramConfigSyllabuses {
  constructor(listSyllabuses) {
    this.listSyllabuses = listSyllabuses;
  }

  async execute() {
    const syllabuses = await this.listSyllabuses();

    return syllabuses.map((syllabus) => ({
      id: syllabus.id,
      country: syllabus.country,
      level: syllabus.level,
      year: syllabus.year,
      subject: syllabus.subject,
      topicCount: syllabus.topics.length
    }));
  }
}
