const MAX_DESCRIPTION_LENGTH = 5000;

function requireDescription(value) {
  const description = String(value || "").trim();

  if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error("A diagram description of at most 5000 characters is required.");
  }

  return description;
}

function getMermaidCode(response) {
  const code = String(response?.mermaidCode || "")
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!code) {
    throw new Error("The LLM response must contain mermaidCode.");
  }

  return code;
}

class GenerateMermaidInstruction {
  constructor(generateLlmText) {
    this.generateLlmText = generateLlmText;
  }

  async repair({ description, mermaidCode, errorMessage }, llmOptions = {}) {
    const prompt = [
      "Repair the Mermaid source so that it parses and renders successfully.",
      "Retain the intended meaning of the diagram description.",
      "Use only standard Mermaid syntax.",
      "Convert unsupported bar chart syntax to valid xychart-beta syntax.",
      "For xychart-beta, double-quote every text title, axis title, and x-axis category label, especially non-ASCII labels.",
      "Do not include directives, actions, links, scripts, HTML, icons, images, or Markdown fences.",
      "Return only valid JSON in this exact shape:",
      '{ "mermaidCode": "corrected Mermaid source" }',
      `Diagram description:\n${requireDescription(description)}`,
      `Rejected Mermaid source:\n${String(mermaidCode || "").trim()}`,
      `Mermaid error:\n${String(errorMessage || "Unknown error").slice(0, 1200)}`,
    ].join("\n\n");

    return getMermaidCode(await this.generateLlmText(prompt, llmOptions));
  }
}

module.exports = {
  GenerateMermaidInstruction,
};
