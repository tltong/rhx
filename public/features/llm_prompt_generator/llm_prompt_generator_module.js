import {
  getLlmPromptConfigById,
  listLlmPromptConfigs
} from "../llm_prompt_config/llm_prompt_config_module.js?v=20260719-question-topics";
import {
  getSyllabusById,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260719-question-topics";
import {
  LlmPromptGenerator
} from "./domain/llm_prompt_generator.js?v=20260722-mermaid-chart-repair";
import {
  GenerateLlmPrompt
} from "./application/generate_llm_prompt.js?v=20260722-generation-input-type";
import {
  GenerateLlmPromptWithDiagram
} from "./application/generate_llm_prompt_with_diagram.js?v=20260722-generation-input-type";
import {
  LoadLlmPromptGeneratorOptions
} from "./application/load_llm_prompt_generator_options.js?v=20260719-question-topics";

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
    promptGenerator
  });
const loadLlmPromptGeneratorOptionsUseCase =
  new LoadLlmPromptGeneratorOptions({
    listLlmPromptConfigs,
    listSyllabuses
  });

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
  loadLlmPromptGeneratorOptions
};
