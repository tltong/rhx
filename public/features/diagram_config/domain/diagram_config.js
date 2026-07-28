function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizePercentage(value) {
  const percentage = Number(value);

  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error(
      "diagramQuestionPercentage must be a number between 0 and 100."
    );
  }

  return percentage;
}

export class DiagramTopicConfig {
  constructor({
    topicId,
    topicName = "",
    isDiagramApplicable = false,
    diagramQuestionPercentage = 0
  }) {
    this.topicId = requireIdentifier(topicId, "topicId");
    this.topicName = String(topicName ?? "").trim();
    this.isDiagramApplicable = isDiagramApplicable === true;
    this.diagramQuestionPercentage = this.isDiagramApplicable
      ? normalizePercentage(diagramQuestionPercentage)
      : 0;
  }

  update({
    isDiagramApplicable,
    diagramQuestionPercentage
  }) {
    if (isDiagramApplicable !== undefined) {
      this.isDiagramApplicable = isDiagramApplicable === true;
    }

    if (diagramQuestionPercentage !== undefined) {
      this.diagramQuestionPercentage = normalizePercentage(
        diagramQuestionPercentage
      );
    }

    if (!this.isDiagramApplicable) {
      this.diagramQuestionPercentage = 0;
    }

    return this;
  }
}

export class DiagramConfig {
  constructor({
    syllabusId,
    topics = []
  }) {
    if (!Array.isArray(topics)) {
      throw new Error("topics must be an array.");
    }

    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.topics = topics.map((topic) => (
      topic instanceof DiagramTopicConfig
        ? topic
        : new DiagramTopicConfig(topic)
    ));
  }
}
