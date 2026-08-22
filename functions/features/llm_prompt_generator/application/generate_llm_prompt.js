class GenerateLlmPrompt {
  constructor({
    getLlmPromptConfigById,
    getSyllabusById,
    getSyllabusTopicPromptInstructions,
    getTopicDiagramPercentage = null,
    promptGenerator,
    useDiagramConfig = false,
  }) {
    this.getLlmPromptConfigById = getLlmPromptConfigById;
    this.getSyllabusById = getSyllabusById;
    this.getSyllabusTopicPromptInstructions =
      getSyllabusTopicPromptInstructions;
    this.getTopicDiagramPercentage = getTopicDiagramPercentage;
    this.promptGenerator = promptGenerator;
    this.useDiagramConfig = useDiagramConfig === true;
  }

  generatePrompt(input) {
    return this.promptGenerator.generate(input);
  }

  async execute(llmPromptConfigId, syllabusId, generationInput = {}) {
    const configId = String(llmPromptConfigId || "").trim();
    const selectedSyllabusId = String(syllabusId || "").trim();
    const topicId = String(generationInput.topicId || "").trim();

    if (!configId || !selectedSyllabusId || !topicId) {
      throw new Error("LLM prompt config, syllabus, and topic are required.");
    }

    const [config, syllabus, instructions, diagramPercentage] =
      await Promise.all([
        this.getLlmPromptConfigById(configId),
        this.getSyllabusById(selectedSyllabusId),
        this.getSyllabusTopicPromptInstructions(selectedSyllabusId, topicId),
        this.useDiagramConfig
          ? this.getTopicDiagramPercentage(selectedSyllabusId, topicId)
          : 0,
      ]);

    if (!config || !syllabus) {
      throw new Error("Selected LLM prompt config or syllabus was not found.");
    }

    return this.generatePrompt({
      llmPromptConfig: config,
      syllabus,
      ...generationInput,
      topicId,
      diagramQuestionPercentage: diagramPercentage,
      syllabusAdditionalInstructions:
        instructions.syllabusAdditionalInstructions,
      topicAdditionalInstructions: instructions.topicAdditionalInstructions,
    });
  }
}

module.exports = {
  GenerateLlmPrompt,
};
