const {
  createQuestionBatchSizes,
  mapLlmResponseToQuestionInputs,
  normalizeQuestionGenerationInput,
  resolveQuestionGenerationContext,
} = require("../domain/question_generation");
const {
  DIAGRAM_QUESTION_MAX_TOKENS,
  STANDARD_QUESTION_MAX_TOKENS,
  attachPromptContext,
  copyLlmOptions,
  isRetryableGenerationError,
  renderQuestionDiagrams,
  requireIdentifier,
} = require("./generation_support");

function appendGeneratedQuestionTexts(avoidQuestionTexts, questions) {
  const seen = new Set(
    avoidQuestionTexts.map((text) => text.toLocaleLowerCase()),
  );

  questions.forEach((question) => {
    const text = String(question?.questionText ?? "").trim();
    const key = text.toLocaleLowerCase();

    if (text && !seen.has(key)) {
      seen.add(key);
      avoidQuestionTexts.push(text);
    }
  });
}

class GenerateQuestions {
  constructor({
    generatePrompt,
    generateLlmText,
    getSyllabusById,
    writeQuestions,
    renderMermaidDiagram = null,
    hasDiagram = false,
    llmOptions = {},
  }) {
    this.generatePrompt = generatePrompt;
    this.generateLlmText = generateLlmText;
    this.getSyllabusById = getSyllabusById;
    this.writeQuestions = writeQuestions;
    this.renderMermaidDiagram = renderMermaidDiagram;
    this.hasDiagram = hasDiagram === true;
    this.llmOptions = copyLlmOptions(llmOptions);

    if (this.hasDiagram && typeof renderMermaidDiagram !== "function") {
      throw new Error("renderMermaidDiagram is required.");
    }
  }

  async generateBatch({
    configId,
    syllabusId,
    generationInput,
    topics,
    batchSize,
    questionOffset,
    prompts,
    retryAttempt = 0,
  }) {
    const prompt = await this.generatePrompt(configId, syllabusId, {
      ...generationInput,
      numberOfQuestions: batchSize,
      avoidQuestionTexts: [...generationInput.avoidQuestionTexts],
    });

    prompts.push(prompt);

    try {
      const response = await this.generateLlmText(prompt, {
        ...this.llmOptions,
        maxTokens: this.hasDiagram
          ? DIAGRAM_QUESTION_MAX_TOKENS
          : STANDARD_QUESTION_MAX_TOKENS,
      });
      const questionInputs = mapLlmResponseToQuestionInputs({
        response,
        expectedQuestionCount: batchSize,
        syllabusId,
        topics,
        generationInput,
        allowDiagrams: this.hasDiagram,
        questionOffset,
      });

      const renderedQuestions = this.hasDiagram
        ? await renderQuestionDiagrams(
          questionInputs,
          this.renderMermaidDiagram,
          this.llmOptions,
        )
        : questionInputs;

      appendGeneratedQuestionTexts(
        generationInput.avoidQuestionTexts,
        renderedQuestions,
      );

      return renderedQuestions;
    } catch (error) {
      if (retryAttempt === 0 && isRetryableGenerationError(error)) {
        return this.generateBatch({
          configId,
          syllabusId,
          generationInput,
          topics,
          batchSize,
          questionOffset,
          prompts,
          retryAttempt: 1,
        });
      }

      if (batchSize > 1) {
        const firstSize = Math.ceil(batchSize / 2);
        const first = await this.generateBatch({
          configId,
          syllabusId,
          generationInput,
          topics,
          batchSize: firstSize,
          questionOffset,
          prompts,
        });
        const second = await this.generateBatch({
          configId,
          syllabusId,
          generationInput,
          topics,
          batchSize: batchSize - firstSize,
          questionOffset: questionOffset + first.length,
          prompts,
        });

        return [...first, ...second];
      }

      throw error;
    }
  }

  async execute(llmPromptConfigId, syllabusId, generationInput) {
    const configId = requireIdentifier(
      llmPromptConfigId,
      "llmPromptConfigId",
    );
    const selectedSyllabusId = requireIdentifier(syllabusId, "syllabusId");
    const normalizedInput = normalizeQuestionGenerationInput(generationInput);
    const syllabus = await this.getSyllabusById(selectedSyllabusId);
    const context = resolveQuestionGenerationContext(
      syllabus,
      normalizedInput,
    );
    const prompts = [];
    const questionInputs = [];
    const activeGenerationInput = {
      ...context.generationInput,
      avoidQuestionTexts: [
        ...context.generationInput.avoidQuestionTexts,
      ],
    };

    try {
      for (const batchSize of createQuestionBatchSizes(
        context.generationInput.numberOfQuestions,
      )) {
        questionInputs.push(...await this.generateBatch({
          configId,
          syllabusId: selectedSyllabusId,
          generationInput: activeGenerationInput,
          topics: context.topics,
          batchSize,
          questionOffset: questionInputs.length,
          prompts,
        }));
      }

      return {
        prompts,
        questions: await this.writeQuestions(questionInputs),
      };
    } catch (error) {
      throw attachPromptContext(error, prompts);
    }
  }
}

module.exports = {
  GenerateQuestions,
};
