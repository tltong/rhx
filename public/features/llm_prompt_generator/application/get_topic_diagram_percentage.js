function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

export function resolveTopicDiagramPercentage(result, topicId) {
  const selectedTopicId = requireIdentifier(topicId, "topicId");
  const topicConfig = result?.config?.topics?.find(
    (topic) => topic.topicId === selectedTopicId
  );

  if (!topicConfig || topicConfig.isDiagramApplicable !== true) {
    return 0;
  }

  const percentage = Number(topicConfig.diagramQuestionPercentage);

  if (
    !Number.isFinite(percentage)
    || percentage < 0
    || percentage > 100
  ) {
    throw new Error(
      "Diagram question percentage must be between 0 and 100."
    );
  }

  return percentage;
}

export class GetTopicDiagramPercentage {
  constructor(getDiagramConfigForSyllabus) {
    this.getDiagramConfigForSyllabus = getDiagramConfigForSyllabus;
  }

  async execute(syllabusId, topicId) {
    const selectedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const selectedTopicId = requireIdentifier(topicId, "topicId");
    const result = await this.getDiagramConfigForSyllabus(
      selectedSyllabusId
    );

    return resolveTopicDiagramPercentage(result, selectedTopicId);
  }
}
