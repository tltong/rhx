export const preAssessmentStates = Object.freeze({
  COMPLETED: "completed",
  NOT_COMPLETED: "not-completed",
  NOT_CONFIGURED: "not-configured"
});

function sortFrameworkLevels(framework) {
  if (!framework || !Array.isArray(framework.levels)) {
    return [];
  }

  return [...framework.levels].sort((first, second) => (
    Number(first.sequenceOrder) - Number(second.sequenceOrder)
  ));
}

function createUndeterminedSummary({
  preAssessmentState,
  framework,
  totalLevelCount
}) {
  return {
    preAssessmentState,
    currentLevelId: null,
    currentLevelName: "Not determined",
    nextLevelName: "Not determined",
    finalLevelName: framework?.endLevelName || "Final level",
    progressPercentage: 0,
    totalLevelCount,
    isFinalLevel: false
  };
}

export function summarizeTopicProgress({
  hasPreAssessment,
  preAssessmentCompleted,
  currentLevelId,
  framework,
  endLevelId
}) {
  const levels = sortFrameworkLevels(framework);
  const totalLevelCount = levels.length + 1;
  const preAssessmentState = !hasPreAssessment
    ? preAssessmentStates.NOT_CONFIGURED
    : preAssessmentCompleted
      ? preAssessmentStates.COMPLETED
      : preAssessmentStates.NOT_COMPLETED;

  if (!preAssessmentCompleted) {
    return createUndeterminedSummary({
      preAssessmentState,
      framework,
      totalLevelCount
    });
  }

  if (!currentLevelId) {
    return {
      ...createUndeterminedSummary({
        preAssessmentState,
        framework,
        totalLevelCount
      }),
      currentLevelName: "Pending calculation",
      nextLevelName: "Pending calculation"
    };
  }

  if (currentLevelId === endLevelId) {
    return {
      preAssessmentState,
      currentLevelId,
      currentLevelName: framework?.endLevelName || "Final level",
      nextLevelName: "Final level reached",
      finalLevelName: framework?.endLevelName || "Final level",
      progressPercentage: 100,
      totalLevelCount,
      isFinalLevel: true
    };
  }

  const currentIndex = levels.findIndex((level) => level.id === currentLevelId);

  if (currentIndex < 0) {
    return {
      preAssessmentState,
      currentLevelId,
      currentLevelName: currentLevelId,
      nextLevelName: "Not available",
      finalLevelName: framework?.endLevelName || "Final level",
      progressPercentage: 0,
      totalLevelCount,
      isFinalLevel: false
    };
  }

  const nextLevel = levels[currentIndex + 1];
  const progressPercentage = Math.round(
    ((currentIndex + 1) / totalLevelCount) * 100
  );

  return {
    preAssessmentState,
    currentLevelId,
    currentLevelName: levels[currentIndex].levelName,
    nextLevelName: nextLevel?.levelName
      || framework?.endLevelName
      || "Final level",
    finalLevelName: framework?.endLevelName || "Final level",
    progressPercentage,
    totalLevelCount,
    isFinalLevel: false
  };
}
