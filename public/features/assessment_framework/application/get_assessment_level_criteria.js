function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function requireFiniteNumber(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  return number;
}

function toAssessmentLevelCriteria(
  assessmentFrameworkId,
  level
) {
  const criteria = level.criteria || {};

  return Object.freeze({
    assessmentFrameworkId,
    levelId: requireIdentifier(level.id, "level.id"),
    levelName: requireIdentifier(level.levelName, "level.levelName"),
    sequenceOrder: requireFiniteNumber(
      level.sequenceOrder,
      "level.sequenceOrder"
    ),
    criteria: Object.freeze({
      requiredPracticeCount: requireFiniteNumber(
        criteria.requiredPracticeCount,
        "level.criteria.requiredPracticeCount"
      ),
      minimumScore: requireFiniteNumber(
        criteria.minimumScore,
        "level.criteria.minimumScore"
      ),
      questionsPerPractice: requireFiniteNumber(
        criteria.questionsPerPractice,
        "level.criteria.questionsPerPractice"
      ),
      difficultyLevel: requireIdentifier(
        criteria.difficultyLevel,
        "level.criteria.difficultyLevel"
      )
    })
  });
}

export class GetAssessmentLevelCriteria {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute({ assessmentFrameworkId, levelId } = {}) {
    const normalizedFrameworkId = requireIdentifier(
      assessmentFrameworkId,
      "assessmentFrameworkId"
    );
    const normalizedLevelId = requireIdentifier(levelId, "levelId");
    const assessmentFramework =
      await this.assessmentFrameworkRepository.getById(
        normalizedFrameworkId
      );

    if (!assessmentFramework) {
      throw new Error(
        `Assessment framework ${normalizedFrameworkId} was not found.`
      );
    }

    const level = assessmentFramework.levels.find(
      (item) => item.id === normalizedLevelId
    );

    if (!level) {
      throw new Error(
        `Assessment level ${normalizedLevelId} was not found in framework ${normalizedFrameworkId}.`
      );
    }

    return toAssessmentLevelCriteria(normalizedFrameworkId, level);
  }
}
