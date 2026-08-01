import {
  getLlmPromptConfigById,
  getSyllabusTopicPromptInstructions,
  listLlmPromptConfigs
} from "../llm_prompt_config/llm_prompt_config_module.js?v=20260801-syllabus-topic-instructions";
import {
  getSyllabusById,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260719-question-topics";
import {
  getDiagramConfigForSyllabus
} from "../diagram_config/diagram_config_module.js?v=20260727-topic-diagram-config";
import {
  LlmPromptGenerator
} from "./domain/llm_prompt_generator.js?v=20260801-syllabus-topic-instructions";
import {
  GenerateLlmPrompt
} from "./application/generate_llm_prompt.js?v=20260801-syllabus-topic-instructions";
import {
  GenerateLlmPromptWithDiagram
} from "./application/generate_llm_prompt_with_diagram.js?v=20260801-syllabus-topic-instructions";
import {
  GenerateLlmPromptFromPlan
} from "./application/generate_llm_prompt_from_plan.js?v=20260801-syllabus-topic-instructions";
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
  getSyllabusTopicPromptInstructions,
  promptGenerator
});
const generateLlmPromptWithDiagramUseCase =
  new GenerateLlmPromptWithDiagram({
    getLlmPromptConfigById,
    getSyllabusById,
    getSyllabusTopicPromptInstructions,
    getDiagramConfigForSyllabus,
    promptGenerator,
    useDiagramConfig: true
  });
const generateLlmPromptFromPlanUseCase = new GenerateLlmPromptFromPlan({
  getLlmPromptConfigById,
  getSyllabusById,
  getSyllabusTopicPromptInstructions,
  promptGenerator
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

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {import("./domain/llm_prompt_generator.js").LlmPromptGenerationPlanInput} generationInput
 * @returns {Promise<string>}
 */
async function generateLlmPromptFromPlan(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generateLlmPromptFromPlanUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

export {
  generateLlmPrompt,
  generateLlmPromptWithDiagram,
  generateLlmPromptFromPlan,
  loadLlmPromptGeneratorOptions,
  getTopicDiagramPercentage
};
