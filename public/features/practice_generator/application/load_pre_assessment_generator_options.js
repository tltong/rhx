function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

export class LoadPreAssessmentGeneratorOptions {
  constructor(listSyllabuses, {getAssessmentFrameworkById} = {}) {
    this.getAssessmentFrameworkById = getAssessmentFrameworkById;
    this.listSyllabuses = requireFunction(
      listSyllabuses,
      "listSyllabuses"
    );
  }

  async execute() {
    const syllabuses = await this.listSyllabuses();
    const frameworkTypes = {};
    const ids = new Set(syllabuses.flatMap(syllabus => [syllabus.assessmentFrameworkId, ...(syllabus.topics || []).flatMap(topic => Object.values(topic.assessmentFrameworkIds || {}))]).filter(Boolean));
    if (this.getAssessmentFrameworkById) await Promise.all([...ids].map(async id => {const framework = await this.getAssessmentFrameworkById(id); if (framework) frameworkTypes[id] = framework.frameworkType || "normal";}));

    return {
      syllabuses: syllabuses
        .filter((syllabus) => (
          syllabus.id &&
          Array.isArray(syllabus.topics) &&
          syllabus.topics.length > 0 &&
          Array.isArray(syllabus.languages) &&
          syllabus.languages.length > 0
        ))
        .map((syllabus) => ({
          id: syllabus.id,
          assessmentFrameworkId: syllabus.assessmentFrameworkId || null,
          frameworkTypes,
          country: syllabus.country,
          level: syllabus.level,
          year: syllabus.year,
          subject: syllabus.subject,
          active: syllabus.active === true,
          languages: [...syllabus.languages],
          topics: syllabus.topics.map((topic) => ({
            id: topic.id,
            topicName: topic.topicName,
            assessmentFrameworkIds: {...(topic.assessmentFrameworkIds || {})},
            preAssessmentPractices: {
              ...(topic.preAssessmentPractices || {})
            }
          }))
        }))
    };
  }
}
