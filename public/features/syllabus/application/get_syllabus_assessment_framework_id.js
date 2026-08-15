function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

export class GetSyllabusAssessmentFrameworkId {
  constructor(syllabusRepository) {
    this.syllabusRepository = syllabusRepository;
  }

  async execute(syllabusId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const syllabus = await this.syllabusRepository.getById(
      normalizedSyllabusId
    );

    if (!syllabus) {
      throw new Error(`Syllabus ${normalizedSyllabusId} was not found.`);
    }

    return requireIdentifier(
      syllabus.assessmentFrameworkId,
      `Syllabus ${normalizedSyllabusId} assessmentFrameworkId`
    );
  }
}
