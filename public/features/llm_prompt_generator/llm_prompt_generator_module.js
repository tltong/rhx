import {
  getLlmPromptConfigById,
  listLlmPromptConfigs
} from "../llm_prompt_config/llm_prompt_config_module.js?v=20260719-question-topics";
import {
  getSyllabusById,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260719-question-topics";
import {
  getDiagramConfigForSyllabus
} from "../diagram_config/diagram_config_module.js?v=20260727-topic-diagram-config";
import {
  LlmPromptGenerator
} from "./domain/llm_prompt_generator.js?v=20260727-topic-diagram-config";
import {
  GenerateLlmPrompt
} from "./application/generate_llm_prompt.js?v=20260727-topic-diagram-percentage";
import {
  GenerateLlmPromptWithDiagram
} from "./application/generate_llm_prompt_with_diagram.js?v=20260727-topic-diagram-percentage";
import {
  LoadLlmPromptGeneratorOptions
} from "./application/load_llm_prompt_generator_options.js?v=20260719-question-topics";
import {
  GetTopicDiagramPercentage
} from "./application/get_topic_diagram_percentage.js?v=20260727-topic-diagram-percentage";

const promptGenerator = new LlmPromptGenerator();
const generateLlmPromptUseCase = new GenerateLlmPrompt({
  getLlmPromptConfigById,
  getSyllabusById,
  promptGenerator
});
const generateLlmPromptWithDiagramUseCase =
  new GenerateLlmPromptWithDiagram({
    getLlmPromptConfigById,
    getSyllabusById,
    getDiagramConfigForSyllabus,
    promptGenerator,
    useDiagramConfig: true
  });
const loadLlmPromptGeneratorOptionsUseCase =
  new LoadLlmPromptGeneratorOptions({
    listLlmPromptConfigs,
    listSyllabuses
  });
const getTopicDiagramPercentageUseCase =
  new GetTopicDiagramPercentage(getDiagramConfigForSyllabus);

/**
 * @typedef {import("./domain/llm_prompt_generator.js").LlmPromptGenerationInput}
 * LlmPromptGenerationInput
 */

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {LlmPromptGenerationInput} generationInput
 * @returns {Promise<string>}
 */
async function generateLlmPrompt(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generateLlmPromptUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

async function loadLlmPromptGeneratorOptions() {
  return loadLlmPromptGeneratorOptionsUseCase.execute();
}

async function getTopicDiagramPercentage(syllabusId, topicId) {
  return getTopicDiagramPercentageUseCase.execute(syllabusId, topicId);
}

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {LlmPromptGenerationInput} generationInput
 * @returns {Promise<string>}
 */
async function generateLlmPromptWithDiagram(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generateLlmPromptWithDiagramUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

export {
  generateLlmPrompt,
  generateLlmPromptWithDiagram,
  loadLlmPromptGeneratorOptions,
  getTopicDiagramPercentage
};
