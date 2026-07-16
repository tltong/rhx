export class LlmPromptConfig {
  constructor({
    id,
    identifier,
    primaryContext = "",
    secondaryContext = "",
    overallAdditionalInstructions = "",
    primary = {},
    secondary = {}
  }) {
    this.id = id;
    this.identifier = identifier;
    this.primaryContext = primaryContext;
    this.secondaryContext = secondaryContext;
    this.overallAdditionalInstructions = overallAdditionalInstructions;
    this.primary = primary;
    this.secondary = secondary;
  }

  update({
    identifier,
    primaryContext,
    secondaryContext,
    overallAdditionalInstructions,
    primary,
    secondary
  }) {
    if (identifier !== undefined) {
      this.identifier = identifier;
    }

    if (primaryContext !== undefined) {
      this.primaryContext = primaryContext;
    }

    if (secondaryContext !== undefined) {
      this.secondaryContext = secondaryContext;
    }

    if (overallAdditionalInstructions !== undefined) {
      this.overallAdditionalInstructions = overallAdditionalInstructions;
    }

    if (primary !== undefined) {
      this.primary = primary;
    }

    if (secondary !== undefined) {
      this.secondary = secondary;
    }

    return this;
  }

  setPrimaryContext(primaryContext) {
    this.primaryContext = primaryContext;

    return this;
  }

  setSecondaryContext(secondaryContext) {
    this.secondaryContext = secondaryContext;

    return this;
  }

  setOverallAdditionalInstructions(overallAdditionalInstructions) {
    this.overallAdditionalInstructions = overallAdditionalInstructions;

    return this;
  }

  setYearAdditionalInstructions(level, year, additionalInstructions) {
    const levelKey = String(level || "").trim().toLowerCase();
    const yearKey = String(year || "").trim();

    if (!this[levelKey]) {
      this[levelKey] = {};
    }

    this[levelKey] = {
      ...this[levelKey],
      [yearKey]: {
        additionalInstructions
      }
    };

    return this;
  }
}
