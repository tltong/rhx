function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function normalizeInstructions(value) {
  return value === null || value === undefined ? "" : String(value);
}

export class SyllabusPromptInstructions {
  constructor({
    syllabusId,
    additionalInstructions = ""
  } = {}) {
    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.additionalInstructions = normalizeInstructions(
      additionalInstructions
    );
  }
}

export class TopicPromptInstructions {
  constructor({
    syllabusId,
    topicId,
    additionalInstructions = ""
  } = {}) {
    this.syllabusId = requireIdentifier(syllabusId, "syllabusId");
    this.topicId = requireIdentifier(topicId, "topicId");
    this.additionalInstructions = normalizeInstructions(
      additionalInstructions
    );
  }
}
