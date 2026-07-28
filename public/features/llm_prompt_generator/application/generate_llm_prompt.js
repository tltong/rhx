/**
 * @typedef {import("../domain/llm_prompt_generator.js").LlmPromptGenerationInput}
 * LlmPromptGenerationInput
 */

import {
  resolveTopicDiagramPercentage
} from "./get_topic_diagram_percentage.js?v=20260727-topic-diagram-percentage";

export class GenerateLlmPrompt {
  constructor({
    getLlmPromptConfigById,
    getSyllabusById,
    getDiagramConfigForSyllabus = null,
    promptGenerator,
    useDiagramConfig = false
  }) {
    this.getLlmPromptConfigById = getLlmPromptConfigById;
    this.getSyllabusById = getSyllabusById;
    this.getDiagramConfigForSyllabus = getDiagramConfigForSyllabus;
    this.promptGenerator = promptGenerator;
    this.useDiagramConfig = useDiagramConfig === true;

    if (
      this.useDiagramConfig
      && typeof this.getDiagramConfigForSyllabus !== "function"
    ) {
      throw new Error(
        "getDiagramConfigForSyllabus is required for diagram prompts."
      );
    }
  }

  generatePrompt(input) {
    return this.promptGenerator.generate(input);
  }

  async getDiagramQuestionPercentage(syllabusId, topicId) {
    if (!this.useDiagramConfig) {
      return 0;
    }

    const result = await this.getDiagramConfigForSyllabus(syllabusId);

    return resolveTopicDiagramPercentage(result, topicId);
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
      topicId,
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

    const normalizedTopicId = String(topicId || "").trim();

    if (!normalizedTopicId) {
      throw new Error("Topic is required.");
    }

    const [llmPromptConfig, syllabus, diagramQuestionPercentage] =
      await Promise.all([
        this.getLlmPromptConfigById(normalizedConfigId),
        this.getSyllabusById(normalizedSyllabusId),
        this.getDiagramQuestionPercentage(
          normalizedSyllabusId,
          normalizedTopicId
        )
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
      topicId: normalizedTopicId,
      numberOfQuestions,
      difficultyLevel,
      language,
      additionalInstructions,
      diagramQuestionPercentage
    });
  }
}
