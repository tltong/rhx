function normalizeText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeYearInstructions(instructions = {}) {
  if (!instructions || typeof instructions !== "object" || Array.isArray(instructions)) {
    throw new Error("year instructions must be an object.");
  }

  return Object.fromEntries(Object.entries(instructions).map(([year, value]) => [
    String(year),
    {
      additionalInstructions: normalizeText(
        typeof value === "string" ? value : value?.additionalInstructions,
      ),
    },
  ]));
}

class LlmPromptConfig {
  constructor({
    id,
    identifier,
    primaryContext = "",
    secondaryContext = "",
    overallAdditionalInstructions = "",
    primary = {},
    secondary = {},
  } = {}) {
    this.id = String(id || "").trim();
    this.identifier = String(identifier || "").trim();
    this.primaryContext = normalizeText(primaryContext);
    this.secondaryContext = normalizeText(secondaryContext);
    this.overallAdditionalInstructions = normalizeText(
      overallAdditionalInstructions,
    );
    this.primary = normalizeYearInstructions(primary);
    this.secondary = normalizeYearInstructions(secondary);
  }
}

module.exports = {
  LlmPromptConfig,
};
