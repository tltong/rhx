function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function toAssessmentLevelCriteria(
  assessmentFrameworkId,
  level,
) {
  return Object.freeze({
    assessmentFrameworkId,
    levelId: level.id,
    levelName: level.levelName,
    sequenceOrder: level.sequenceOrder,
    criteria: Object.freeze({
      requiredPracticeCount: level.criteria.requiredPracticeCount,
      minimumScore: level.criteria.minimumScore,
      questionsPerPractice: level.criteria.questionsPerPractice,
      difficultyLevel: level.criteria.difficultyLevel,
    }),
  });
}

class GetAssessmentLevelCriteria {
  constructor(assessmentFrameworkRepository) {
    if (!assessmentFrameworkRepository) {
      throw new Error("assessmentFrameworkRepository is required.");
    }

    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute({assessmentFrameworkId, levelId} = {}) {
    const normalizedFrameworkId = requireIdentifier(
      assessmentFrameworkId,
      "assessmentFrameworkId",
    );
    const normalizedLevelId = requireIdentifier(levelId, "levelId");
    const assessmentFramework =
      await this.assessmentFrameworkRepository.getById(
        normalizedFrameworkId,
      );

    if (!assessmentFramework) {
      throw new Error(
        `Assessment framework ${normalizedFrameworkId} was not found.`,
      );
    }

    const level = assessmentFramework.levels.find(
      (item) => item.id === normalizedLevelId,
    );

    if (!level) {
      throw new Error(
        `Assessment level ${normalizedLevelId} was not found ` +
        `in framework ${normalizedFrameworkId}.`,
      );
    }

    return toAssessmentLevelCriteria(normalizedFrameworkId, level);
  }
}

module.exports = {
  GetAssessmentLevelCriteria,
};
