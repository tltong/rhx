function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizePercentage(value) {
  const percentage = Number(value);

  if (
    !Number.isFinite(percentage) ||
    percentage < 0 ||
    percentage > 100
  ) {
    throw new Error(
      "diagramQuestionPercentage must be between 0 and 100.",
    );
  }

  return percentage;
}

class DiagramTopicConfig {
  constructor({
    topicId,
    isDiagramApplicable = false,
    diagramQuestionPercentage = 0,
  }) {
    this.topicId = requireIdentifier(topicId, "topicId");
    this.isDiagramApplicable = isDiagramApplicable === true;
    this.diagramQuestionPercentage = this.isDiagramApplicable
      ? normalizePercentage(diagramQuestionPercentage)
      : 0;

    Object.freeze(this);
  }
}

class DiagramConfig {
  constructor({
    syllabusId,
    topics = [],
  }) {
    if (!Array.isArray(topics)) {
      throw new Error("topics must be an array.");
    }

    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.topics = Object.freeze(
      topics.map((topic) =>
        topic instanceof DiagramTopicConfig
          ? topic
          : new DiagramTopicConfig(topic),
      ),
    );

    Object.freeze(this);
  }
}

module.exports = {
  DiagramConfig,
  DiagramTopicConfig,
};
