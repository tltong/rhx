function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

export class GetStudentTopicLevel {
  constructor(studentAssessmentProgressRepository) {
    if (!studentAssessmentProgressRepository) {
      throw new Error("studentAssessmentProgressRepository is required.");
    }

    this.studentAssessmentProgressRepository =
      studentAssessmentProgressRepository;
  }

  async execute({ studentId, syllabusId, topicId } = {}) {
    const normalizedStudentId = requireIdentifier(studentId, "studentId");
    const normalizedSyllabusId = requireIdentifier(syllabusId, "syllabusId");
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const progress = await this.studentAssessmentProgressRepository.getByTopic(
      normalizedStudentId,
      normalizedSyllabusId,
      normalizedTopicId
    );

    if (!progress) {
      return null;
    }

    return progress.currentLevelId;
  }
}
