const {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
} = require("../../../schema/assessment_framework_schema");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeScore(value, index) {
  const score = Number(value);

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`scores[${index}] must be between 0 and 100.`);
  }

  return score;
}

function normalizeScores(scores) {
  if (!Array.isArray(scores)) {
    throw new Error("scores must be an array.");
  }

  return Object.freeze(scores.map(normalizeScore));
}

function freezeCriteria(criteria) {
  if (
    !Number.isInteger(criteria.requiredPracticeCount)
    || criteria.requiredPracticeCount < 1
  ) {
    throw new Error("criteria.requiredPracticeCount must be a positive integer.");
  }

  if (
    !Number.isFinite(criteria.minimumScore)
    || criteria.minimumScore < 0
    || criteria.minimumScore > 100
  ) {
    throw new Error("criteria.minimumScore must be between 0 and 100.");
  }

  return Object.freeze({
    requiredPracticeCount: criteria.requiredPracticeCount,
    minimumScore: criteria.minimumScore,
    questionsPerPractice: criteria.questionsPerPractice,
    difficultyLevel: criteria.difficultyLevel,
  });
}

class CalculateAssessmentProgression {
  constructor(assessmentFrameworkRepository) {
    if (!assessmentFrameworkRepository) {
      throw new Error("assessmentFrameworkRepository is required.");
    }

    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute({
    assessmentFrameworkId,
    currentLevelId = null,
    scores = [],
  } = {}) {
    const frameworkId = requireIdentifier(
      assessmentFrameworkId,
      "assessmentFrameworkId",
    );
    const normalizedScores = normalizeScores(scores);
    const framework = await this.assessmentFrameworkRepository.getById(
      frameworkId,
    );

    if (!framework) {
      throw new Error(`Assessment framework ${frameworkId} was not found.`);
    }

    if (framework.levels.length === 0) {
      throw new Error("Assessment framework has no levels.");
    }

    if (currentLevelId === ASSESSMENT_FRAMEWORK_END_LEVEL_ID) {
      return Object.freeze({
        assessmentFrameworkId: framework.id,
        previousLevelId: ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
        levelId: ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
        levelName: framework.endLevelName,
        levelChanged: false,
        isEndLevel: true,
        qualifyingPracticeCount: 0,
        criteria: null,
      });
    }

    const normalizedCurrentLevelId = currentLevelId === null
      || currentLevelId === undefined
      || String(currentLevelId).trim() === ""
      ? framework.levels[0].id
      : requireIdentifier(currentLevelId, "currentLevelId");
    const currentLevelIndex = framework.levels.findIndex(
      (level) => level.id === normalizedCurrentLevelId,
    );

    if (currentLevelIndex < 0) {
      throw new Error(
        `Assessment level ${normalizedCurrentLevelId} was not found `
        + `in framework ${framework.id}.`,
      );
    }

    const currentLevel = framework.levels[currentLevelIndex];
    const criteria = freezeCriteria(currentLevel.criteria);
    const qualifyingPracticeCount = normalizedScores.filter(
      (score) => score >= criteria.minimumScore,
    ).length;
    const levelChanged =
      qualifyingPracticeCount >= criteria.requiredPracticeCount;

    if (!levelChanged) {
      return Object.freeze({
        assessmentFrameworkId: framework.id,
        previousLevelId: currentLevel.id,
        levelId: currentLevel.id,
        levelName: currentLevel.levelName,
        levelChanged: false,
        isEndLevel: false,
        qualifyingPracticeCount,
        criteria,
      });
    }

    const nextLevel = framework.levels[currentLevelIndex + 1] || null;

    return Object.freeze({
      assessmentFrameworkId: framework.id,
      previousLevelId: currentLevel.id,
      levelId: nextLevel?.id || ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
      levelName: nextLevel?.levelName || framework.endLevelName,
      levelChanged: true,
      isEndLevel: nextLevel === null,
      qualifyingPracticeCount,
      criteria,
    });
  }
}

module.exports = {
  CalculateAssessmentProgression,
};
