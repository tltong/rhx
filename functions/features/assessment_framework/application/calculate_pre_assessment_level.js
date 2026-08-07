const {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  assessmentFrameworkPreAssessmentScoreBands,
} = require("../../../schema/assessment_framework_schema");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error("score must be between 0 and 100.");
  }

  return score;
}

function getScoreBand(score) {
  return [...assessmentFrameworkPreAssessmentScoreBands]
    .reverse()
    .find((scoreBand) => score >= scoreBand.minimumScore);
}

class CalculatePreAssessmentLevel {
  constructor(assessmentFrameworkRepository) {
    this.assessmentFrameworkRepository = assessmentFrameworkRepository;
  }

  async execute({assessmentFrameworkId, score} = {}) {
    const normalizedAssessmentFrameworkId = requireIdentifier(
      assessmentFrameworkId,
      "assessmentFrameworkId",
    );
    const normalizedScore = normalizeScore(score);
    const assessmentFramework =
      await this.assessmentFrameworkRepository.getById(
        normalizedAssessmentFrameworkId,
      );

    if (!assessmentFramework) {
      throw new Error(
        `Assessment framework ${normalizedAssessmentFrameworkId} was not found.`,
      );
    }

    if (!assessmentFramework.preAssessment) {
      throw new Error(
        "Assessment framework has no pre-assessment configuration.",
      );
    }

    const scoreBand = getScoreBand(normalizedScore);
    const levelId = assessmentFramework.preAssessment
      .scoreLevelSplit[scoreBand.field];

    if (!levelId) {
      throw new Error(
        `No level is configured for score band ${scoreBand.field}.`,
      );
    }

    const isEndLevel = levelId === ASSESSMENT_FRAMEWORK_END_LEVEL_ID;
    const level = isEndLevel
      ? null
      : assessmentFramework.levels.find((item) => item.id === levelId);

    if (!isEndLevel && !level) {
      throw new Error(`Configured assessment level ${levelId} was not found.`);
    }

    return Object.freeze({
      assessmentFrameworkId: assessmentFramework.id,
      score: normalizedScore,
      scoreBand: scoreBand.field,
      levelId,
      levelName: isEndLevel
        ? assessmentFramework.endLevelName
        : level.levelName,
      isEndLevel,
    });
  }
}

module.exports = {
  CalculatePreAssessmentLevel,
};
