export class GenerateLlmPrompt {
  constructor({
    getLlmPromptConfigById,
    getDefaultLlmPromptConfig,
    getSyllabusById,
    promptGenerator
  }) {
    this.getLlmPromptConfigById = getLlmPromptConfigById;
    this.getDefaultLlmPromptConfig = getDefaultLlmPromptConfig;
    this.getSyllabusById = getSyllabusById;
    this.promptGenerator = promptGenerator;
  }

  async execute({
    llmPromptConfigId = null,
    syllabusId,
    topicIds = [],
    numberOfQuestions,
    difficultyLevel,
    additionalInstructions = ""
  }) {
    const normalizedSyllabusId = String(syllabusId || "").trim();
    const normalizedConfigId = String(llmPromptConfigId || "").trim();

    if (!normalizedSyllabusId) {
      throw new Error("Syllabus is required.");
    }

    const [llmPromptConfig, syllabus] = await Promise.all([
      normalizedConfigId
        ? this.getLlmPromptConfigById(normalizedConfigId)
        : this.getDefaultLlmPromptConfig(),
      this.getSyllabusById(normalizedSyllabusId)
    ]);

    if (!llmPromptConfig) {
      throw new Error("Selected LLM prompt config could not be found.");
    }

    if (!syllabus) {
      throw new Error("Selected syllabus could not be found.");
    }

    return this.promptGenerator.generate({
      llmPromptConfig,
      syllabus,
      topicIds,
      numberOfQuestions,
      difficultyLevel,
      additionalInstructions
    });
  }
}
