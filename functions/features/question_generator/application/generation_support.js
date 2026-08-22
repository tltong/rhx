const STANDARD_QUESTION_MAX_TOKENS = 4096;
const DIAGRAM_QUESTION_MAX_TOKENS = 8192;

function requireIdentifier(value, fieldName) {
  const identifier = String(value || "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function copyLlmOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("llmOptions must be an object.");
  }

  return {
    ...options,
    ...(options.thinking ? { thinking: { ...options.thinking } } : {}),
  };
}

function attachPromptContext(error, prompts) {
  if (error && typeof error === "object") {
    error.prompts = [...prompts];
    error.prompt = prompts.at(-1) || null;
  }

  return error;
}

function isRetryableGenerationError(error) {
  const statuses = new Set([408, 429, 500, 502, 503, 504]);

  return statuses.has(error?.status)
    || /valid JSON|questions array|LLM returned|Question \d+|Mermaid|network|timeout|temporar|does not match/i.test(
      String(error?.message || ""),
    );
}

function createDiagramRepairDescription(question) {
  return [
    "Repair only the Mermaid syntax for this educational question.",
    `Question: ${question.questionText}`,
    "Options:",
    ...Object.entries(question.options || {}).map(
      ([key, value]) => `${key}: ${value}`,
    ),
    `Correct answer: ${question.correctAnswer}`,
    `Answer explanation: ${question.explanation}`,
  ].join("\n").slice(0, 4500);
}

async function renderQuestionDiagrams(
  questionInputs,
  renderMermaidDiagram,
  llmOptions,
) {
  const rendered = [];

  for (const questionInput of questionInputs) {
    const { mermaidCode, ...question } = questionInput;

    if (!question.hasDiagram) {
      rendered.push(question);
      continue;
    }

    const result = await renderMermaidDiagram(
      mermaidCode,
      createDiagramRepairDescription(question),
      llmOptions,
    );
    const svg = String(result?.svg || "").trim();

    if (!svg) {
      throw new Error("Mermaid renderer returned an empty SVG.");
    }

    rendered.push({ ...question, svg });
  }

  return rendered;
}

module.exports = {
  DIAGRAM_QUESTION_MAX_TOKENS,
  STANDARD_QUESTION_MAX_TOKENS,
  attachPromptContext,
  copyLlmOptions,
  isRetryableGenerationError,
  renderQuestionDiagrams,
  requireIdentifier,
};
