const {
  createPlannedQuestionBatches,
  mapLlmResponseToPlannedQuestionInputs,
  normalizePlannedQuestionGenerationInput,
  resolvePlannedQuestionGenerationContext,
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

class GeneratePlannedQuestions {
  constructor({
    generatePrompt,
    generateLlmText,
    getSyllabusById,
    writeQuestions,
    renderMermaidDiagram,
    llmOptions = {},
  }) {
    this.generatePrompt = generatePrompt;
    this.generateLlmText = generateLlmText;
    this.getSyllabusById = getSyllabusById;
    this.writeQuestions = writeQuestions;
    this.renderMermaidDiagram = renderMermaidDiagram;
    this.llmOptions = copyLlmOptions(llmOptions);
  }

  async generateBatch({
    configId,
    syllabusId,
    generationInput,
    topics,
    batch,
    questionOffset,
    prompts,
    retryAttempt = 0,
  }) {
    const prompt = await this.generatePrompt(configId, syllabusId, {
      ...generationInput,
      categories: batch.categories,
    });

    prompts.push(prompt);

    try {
      const hasDiagram = batch.categories.some((category) => (
        category.hasDiagram
      ));
      const response = await this.generateLlmText(prompt, {
        ...this.llmOptions,
        maxTokens: hasDiagram
          ? DIAGRAM_QUESTION_MAX_TOKENS
          : STANDARD_QUESTION_MAX_TOKENS,
      });
      const questionInputs = mapLlmResponseToPlannedQuestionInputs({
        response,
        categories: batch.categories,
        syllabusId,
        topics,
        generationInput,
        questionOffset,
      });

      return renderQuestionDiagrams(
        questionInputs,
        this.renderMermaidDiagram,
        this.llmOptions,
      );
    } catch (error) {
      if (retryAttempt === 0 && isRetryableGenerationError(error)) {
        return this.generateBatch({
          configId,
          syllabusId,
          generationInput,
          topics,
          batch,
          questionOffset,
          prompts,
          retryAttempt: 1,
        });
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
    const normalizedInput = normalizePlannedQuestionGenerationInput(
      generationInput,
    );
    const syllabus = await this.getSyllabusById(selectedSyllabusId);
    const context = resolvePlannedQuestionGenerationContext(
      syllabus,
      normalizedInput,
    );
    const batches = createPlannedQuestionBatches(
      context.generationInput.categories,
    );
    const prompts = [];
    const questionInputs = [];

    try {
      for (const batch of batches) {
        questionInputs.push(...await this.generateBatch({
          configId,
          syllabusId: selectedSyllabusId,
          generationInput: context.generationInput,
          topics: context.topics,
          batch,
          questionOffset: questionInputs.length,
          prompts,
        }));
      }

      return {
        prompts,
        questions: await this.writeQuestions(questionInputs),
        batches,
      };
    } catch (error) {
      throw attachPromptContext(error, prompts);
    }
  }
}

module.exports = {
  GeneratePlannedQuestions,
};
