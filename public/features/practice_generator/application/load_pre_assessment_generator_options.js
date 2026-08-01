function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

export class LoadPreAssessmentGeneratorOptions {
  constructor(listSyllabuses) {
    this.listSyllabuses = requireFunction(
      listSyllabuses,
      "listSyllabuses"
    );
  }

  async execute() {
    const syllabuses = await this.listSyllabuses();

    return {
      syllabuses: syllabuses
        .filter((syllabus) => (
          syllabus.id &&
          syllabus.assessmentFrameworkId &&
          Array.isArray(syllabus.topics) &&
          syllabus.topics.length > 0 &&
          Array.isArray(syllabus.languages) &&
          syllabus.languages.length > 0
        ))
        .map((syllabus) => ({
          id: syllabus.id,
          country: syllabus.country,
          level: syllabus.level,
          year: syllabus.year,
          subject: syllabus.subject,
          active: syllabus.active === true,
          languages: [...syllabus.languages],
          topics: syllabus.topics.map((topic) => ({
            id: topic.id,
            topicName: topic.topicName,
            preAssessmentPractices: {
              ...(topic.preAssessmentPractices || {})
            }
          }))
        }))
    };
  }
}
