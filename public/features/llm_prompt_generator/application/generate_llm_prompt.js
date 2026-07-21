/**
 * @typedef {import("../domain/llm_prompt_generator.js").LlmPromptGenerationInput}
 * LlmPromptGenerationInput
 */

export class GenerateLlmPrompt {
  constructor({
    getLlmPromptConfigById,
    getSyllabusById,
    promptGenerator
  }) {
    this.getLlmPromptConfigById = getLlmPromptConfigById;
    this.getSyllabusById = getSyllabusById;
    this.promptGenerator = promptGenerator;
  }

  generatePrompt(input) {
    return this.promptGenerator.generate(input);
  }

  /**
   * @param {string} llmPromptConfigId
   * @param {string} syllabusId
   * @param {LlmPromptGenerationInput} generationInput
   * @returns {Promise<string>}
   */
  async execute(llmPromptConfigId, syllabusId, generationInput = {}) {
    const {
      numberOfQuestions,
      difficultyLevel,
      language,
      topicIds = [],
      additionalInstructions = ""
    } = generationInput;
    const normalizedSyllabusId = String(syllabusId || "").trim();
    const normalizedConfigId = String(llmPromptConfigId || "").trim();

    if (!normalizedSyllabusId) {
      throw new Error("Syllabus is required.");
    }

    if (!normalizedConfigId) {
      throw new Error("LLM prompt config is required.");
    }

    const [llmPromptConfig, syllabus] = await Promise.all([
      this.getLlmPromptConfigById(normalizedConfigId),
      this.getSyllabusById(normalizedSyllabusId)
    ]);

    if (!llmPromptConfig) {
      throw new Error("Selected LLM prompt config could not be found.");
    }

    if (!syllabus) {
      throw new Error("Selected syllabus could not be found.");
    }

    return this.generatePrompt({
      llmPromptConfig,
      syllabus,
      topicIds,
      numberOfQuestions,
      difficultyLevel,
      language,
      additionalInstructions
    });
  }
}
