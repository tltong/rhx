import {
  createPlannedQuestionBatches,
  mapLlmResponseToPlannedQuestionInputs,
  normalizePlannedQuestionGenerationInput,
  resolvePlannedQuestionGenerationContext
} from "../domain/question_generation.js?v=20260731-planned-question-batches";

const STANDARD_QUESTION_MAX_TOKENS = 4096;
const DIAGRAM_QUESTION_MAX_TOKENS = 8192;

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function copyLlmOptions(llmOptions) {
  if (
    !llmOptions
    || typeof llmOptions !== "object"
    || Array.isArray(llmOptions)
  ) {
    throw new Error("llmOptions must be an object.");
  }

  return {
    ...llmOptions,
    ...(llmOptions.thinking
      ? { thinking: { ...llmOptions.thinking } }
      : {})
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
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  const message = String(error?.message || "");

  return retryableStatuses.has(error?.status)
    || /valid JSON|questions array|LLM returned|Question \d+|Mermaid|network|timeout|temporar|does not match|too many/i.test(
      message
    );
}

function createDiagramRepairDescription(question) {
  const optionLines = Object.entries(question.options || {}).map(
    ([optionKey, optionText]) => `${optionKey}: ${optionText}`
  );

  return [
    "Repair only the Mermaid syntax for this educational question.",
    `Question: ${question.questionText}`,
    "Options:",
    ...optionLines,
    `Correct answer: ${question.correctAnswer}`,
    `Answer explanation: ${question.explanation}`
  ].join("\n").slice(0, 4500);
}

export class GeneratePlannedQuestions {
  constructor({
    generatePrompt,
    generateLlmText,
    getSyllabusById,
    writeQuestions,
    renderMermaidDiagram,
    llmOptions = {}
  }) {
    this.generatePrompt = requireFunction(generatePrompt, "generatePrompt");
    this.generateLlmText = requireFunction(
      generateLlmText,
      "generateLlmText"
    );
    this.getSyllabusById = requireFunction(
      getSyllabusById,
      "getSyllabusById"
    );
    this.writeQuestions = requireFunction(writeQuestions, "writeQuestions");
    this.renderMermaidDiagram = requireFunction(
      renderMermaidDiagram,
      "renderMermaidDiagram"
    );
    this.llmOptions = copyLlmOptions(llmOptions);
  }

  async renderQuestionDiagrams(questionInputs) {
    const renderedQuestionInputs = [];

    for (const questionInput of questionInputs) {
      const { mermaidCode, ...questionData } = questionInput;

      if (!questionData.hasDiagram) {
        renderedQuestionInputs.push(questionData);
        continue;
      }

      const renderResult = await this.renderMermaidDiagram(
        mermaidCode,
        createDiagramRepairDescription(questionData),
        this.llmOptions
      );
      const svg = String(renderResult?.svg || "").trim();

      if (!svg) {
        throw new Error("Mermaid renderer returned an empty SVG.");
      }

      renderedQuestionInputs.push({
        ...questionData,
        svg
      });
    }

    return renderedQuestionInputs;
  }

  async generateBatch({
    llmPromptConfigId,
    syllabusId,
    generationInput,
    topics,
    batch,
    questionOffset,
    prompts,
    retryAttempt = 0
  }) {
    const batchInput = {
      ...generationInput,
      categories: batch.categories
    };
    const prompt = await this.generatePrompt(
      llmPromptConfigId,
      syllabusId,
      batchInput
    );

    prompts.push(prompt);

    try {
      const hasDiagram = batch.categories.some(
        (category) => category.hasDiagram
      );
      const response = await this.generateLlmText(prompt, {
        ...this.llmOptions,
        maxTokens: hasDiagram
          ? DIAGRAM_QUESTION_MAX_TOKENS
          : STANDARD_QUESTION_MAX_TOKENS
      });
      const questionInputs = mapLlmResponseToPlannedQuestionInputs({
        response,
        categories: batch.categories,
        syllabusId,
        topics,
        generationInput,
        questionOffset
      });

      return this.renderQuestionDiagrams(questionInputs);
    } catch (error) {
      if (retryAttempt === 0 && isRetryableGenerationError(error)) {
        return this.generateBatch({
          llmPromptConfigId,
          syllabusId,
          generationInput,
          topics,
          batch,
          questionOffset,
          prompts,
          retryAttempt: 1
        });
      }

      throw error;
    }
  }

  async execute(llmPromptConfigId, syllabusId, generationInput) {
    const normalizedConfigId = requireIdentifier(
      llmPromptConfigId,
      "llmPromptConfigId"
    );
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedInput = normalizePlannedQuestionGenerationInput(
      generationInput
    );
    const syllabus = await this.getSyllabusById(normalizedSyllabusId);
    const context = resolvePlannedQuestionGenerationContext(
      syllabus,
      normalizedInput
    );
    const batches = createPlannedQuestionBatches(
      context.generationInput.categories
    );
    const prompts = [];
    const questionInputs = [];

    try {
      for (const batch of batches) {
        const batchQuestionInputs = await this.generateBatch({
          llmPromptConfigId: normalizedConfigId,
          syllabusId: normalizedSyllabusId,
          generationInput: context.generationInput,
          topics: context.topics,
          batch,
          questionOffset: questionInputs.length,
          prompts
        });

        questionInputs.push(...batchQuestionInputs);
      }

      const questions = await this.writeQuestions(questionInputs);

      return {
        prompts,
        questions,
        batches
      };
    } catch (error) {
      throw attachPromptContext(error, prompts);
    }
  }
}
