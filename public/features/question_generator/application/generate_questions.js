import {
  createQuestionBatchSizes,
  mapLlmResponseToQuestionInputs,
  normalizeQuestionGenerationInput,
  resolveQuestionGenerationContext
} from "../domain/question_generation.js?v=20260722-resilient-diagrams";

/**
 * @typedef {import("../../llm_prompt_generator/domain/llm_prompt_generator.js").LlmPromptGenerationInput}
 * LlmPromptGenerationInput
 */
/**
 * @typedef {import("../domain/question_generation.js").QuestionGenerationResult}
 * QuestionGenerationResult
 */

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

const STANDARD_QUESTION_MAX_TOKENS = 4096;
const DIAGRAM_QUESTION_MAX_TOKENS = 8192;

function isMalformedGenerationError(error) {
  const message = String(error?.message || "");

  return error?.status === 502
    || /valid JSON|questions array|LLM returned|Question \d+|Mermaid/i.test(message);
}

function isTransientGenerationError(error) {
  const transientStatuses = new Set([408, 429, 500, 503, 504]);
  const message = String(error?.message || "");

  return transientStatuses.has(error?.status)
    || /failed to fetch|network|timeout|temporar/i.test(message);
}

function attachPromptContext(error, prompts) {
  if (error && typeof error === "object") {
    error.prompts = [...prompts];
    error.prompt = prompts.at(-1) || null;
  }

  return error;
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

export class GenerateQuestions {
  constructor({
    generatePrompt,
    generateLlmText,
    getSyllabusById,
    writeQuestions,
    renderMermaidDiagram = null,
    hasDiagram = false
  }) {
    this.generatePrompt = generatePrompt;
    this.generateLlmText = generateLlmText;
    this.getSyllabusById = getSyllabusById;
    this.writeQuestions = writeQuestions;
    this.renderMermaidDiagram = renderMermaidDiagram;
    this.hasDiagram = hasDiagram === true;

    if (
      this.hasDiagram
      && typeof this.renderMermaidDiagram !== "function"
    ) {
      throw new Error(
        "renderMermaidDiagram is required for diagram question generation."
      );
    }
  }

  async renderQuestionDiagrams(questionInputs) {
    const renderedQuestionInputs = [];

    for (const questionInput of questionInputs) {
      const { mermaidCode, ...questionData } = questionInput;

      if (!this.hasDiagram) {
        renderedQuestionInputs.push(questionData);
        continue;
      }

      const renderResult = await this.renderMermaidDiagram(
        mermaidCode,
        createDiagramRepairDescription(questionData)
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
    batchSize,
    questionOffset,
    prompts,
    retryAttempt = 0
  }) {
    const batchInput = {
      ...generationInput,
      numberOfQuestions: batchSize
    };
    const prompt = await this.generatePrompt(
      llmPromptConfigId,
      syllabusId,
      batchInput
    );

    prompts.push(prompt);

    try {
      const response = await this.generateLlmText(prompt, {
        maxTokens: this.hasDiagram
          ? DIAGRAM_QUESTION_MAX_TOKENS
          : STANDARD_QUESTION_MAX_TOKENS
      });
      const questionInputs = mapLlmResponseToQuestionInputs({
        response,
        expectedQuestionCount: batchSize,
        syllabusId,
        topics,
        generationInput,
        hasDiagram: this.hasDiagram,
        questionOffset
      });

      return this.renderQuestionDiagrams(questionInputs);
    } catch (error) {
      const shouldSplitImmediately = isMalformedGenerationError(error);
      const shouldRetrySameBatch = retryAttempt === 0
        && !shouldSplitImmediately
        && isTransientGenerationError(error);

      if (shouldRetrySameBatch) {
        return this.generateBatch({
          llmPromptConfigId,
          syllabusId,
          generationInput,
          topics,
          batchSize,
          questionOffset,
          prompts,
          retryAttempt: 1
        });
      }

      if (batchSize > 1) {
        const firstBatchSize = Math.ceil(batchSize / 2);
        const secondBatchSize = batchSize - firstBatchSize;
        const firstQuestions = await this.generateBatch({
          llmPromptConfigId,
          syllabusId,
          generationInput,
          topics,
          batchSize: firstBatchSize,
          questionOffset,
          prompts
        });
        const secondQuestions = await this.generateBatch({
          llmPromptConfigId,
          syllabusId,
          generationInput,
          topics,
          batchSize: secondBatchSize,
          questionOffset: questionOffset + firstQuestions.length,
          prompts
        });

        return [...firstQuestions, ...secondQuestions];
      }

      if (retryAttempt === 0) {
        return this.generateBatch({
          llmPromptConfigId,
          syllabusId,
          generationInput,
          topics,
          batchSize,
          questionOffset,
          prompts,
          retryAttempt: 1
        });
      }

      throw error;
    }
  }

  /**
   * @param {string} llmPromptConfigId
   * @param {string} syllabusId
   * @param {LlmPromptGenerationInput} generationInput
   * @returns {Promise<QuestionGenerationResult>}
   */
  async execute(llmPromptConfigId, syllabusId, generationInput) {
    const normalizedConfigId = requireIdentifier(
      llmPromptConfigId,
      "llmPromptConfigId"
    );
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedInput = normalizeQuestionGenerationInput(
      generationInput
    );
    const syllabus = await this.getSyllabusById(normalizedSyllabusId);
    const context = resolveQuestionGenerationContext(
      syllabus,
      normalizedInput
    );
    const batchSizes = createQuestionBatchSizes(
      context.generationInput.numberOfQuestions
    );
    const prompts = [];
    const questionInputs = [];

    try {
      for (const batchSize of batchSizes) {
        const batchQuestionInputs = await this.generateBatch({
          llmPromptConfigId: normalizedConfigId,
          syllabusId: normalizedSyllabusId,
          generationInput: context.generationInput,
          topics: context.topics,
          batchSize,
          questionOffset: questionInputs.length,
          prompts
        });

        questionInputs.push(...batchQuestionInputs);
      }

      const questions = await this.writeQuestions(questionInputs);

      return {
        prompts,
        questions
      };
    } catch (error) {
      throw attachPromptContext(error, prompts);
    }
  }
}
