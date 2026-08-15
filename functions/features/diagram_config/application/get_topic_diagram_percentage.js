function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function resolveTopicDiagramPercentage(config, topicId) {
  const selectedTopicId = requireIdentifier(topicId, "topicId");
  const topicConfig = config?.topics?.find(
    (topic) => topic.topicId === selectedTopicId,
  );

  if (!topicConfig || topicConfig.isDiagramApplicable !== true) {
    return 0;
  }

  const percentage = Number(topicConfig.diagramQuestionPercentage);

  if (
    !Number.isFinite(percentage) ||
    percentage < 0 ||
    percentage > 100
  ) {
    throw new Error(
      "Diagram question percentage must be between 0 and 100.",
    );
  }

  return percentage;
}

class GetTopicDiagramPercentage {
  constructor(getDiagramConfigBySyllabusId) {
    if (typeof getDiagramConfigBySyllabusId !== "function") {
      throw new Error("getDiagramConfigBySyllabusId must be a function.");
    }

    this.getDiagramConfigBySyllabusId = getDiagramConfigBySyllabusId;
  }

  async execute(syllabusId, topicId) {
    const selectedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId",
    );
    const selectedTopicId = requireIdentifier(topicId, "topicId");
    const config = await this.getDiagramConfigBySyllabusId(
      selectedSyllabusId,
    );

    return resolveTopicDiagramPercentage(config, selectedTopicId);
  }
}

module.exports = {
  GetTopicDiagramPercentage,
  resolveTopicDiagramPercentage,
};
