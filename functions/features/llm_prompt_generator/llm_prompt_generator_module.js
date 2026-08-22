const {
  getTopicDiagramPercentage,
} = require("../diagram_config/diagram_config_module");
const {
  getLlmPromptConfigById,
  getSyllabusTopicPromptInstructions,
  listLlmPromptConfigs,
} = require("../llm_prompt_config/llm_prompt_config_module");
const {
  getSyllabusById,
  listSyllabuses,
} = require("../syllabus/syllabus_module");
const {
  GenerateLlmPrompt,
} = require("./application/generate_llm_prompt");
const {
  GenerateLlmPromptFromPlan,
} = require("./application/generate_llm_prompt_from_plan");
const {
  GenerateLlmPromptWithDiagram,
} = require("./application/generate_llm_prompt_with_diagram");
const {
  LoadLlmPromptGeneratorOptions,
} = require("./application/load_llm_prompt_generator_options");
const {
  LlmPromptGenerator,
} = require("./domain/llm_prompt_generator");

const promptGenerator = new LlmPromptGenerator();
const dependencies = {
  getLlmPromptConfigById,
  getSyllabusById,
  getSyllabusTopicPromptInstructions,
  promptGenerator,
};
const generateLlmPromptUseCase = new GenerateLlmPrompt(dependencies);
const generateLlmPromptWithDiagramUseCase =
  new GenerateLlmPromptWithDiagram({
    ...dependencies,
    getTopicDiagramPercentage,
    useDiagramConfig: true,
  });
const generateLlmPromptFromPlanUseCase =
  new GenerateLlmPromptFromPlan(dependencies);
const loadOptionsUseCase = new LoadLlmPromptGeneratorOptions({
  listLlmPromptConfigs,
  listSyllabuses,
});

async function generateLlmPrompt(configId, syllabusId, generationInput) {
  return generateLlmPromptUseCase.execute(
    configId,
    syllabusId,
    generationInput,
  );
}

async function generateLlmPromptWithDiagram(
  configId,
  syllabusId,
  generationInput,
) {
  return generateLlmPromptWithDiagramUseCase.execute(
    configId,
    syllabusId,
    generationInput,
  );
}

async function generateLlmPromptFromPlan(
  configId,
  syllabusId,
  generationInput,
) {
  return generateLlmPromptFromPlanUseCase.execute(
    configId,
    syllabusId,
    generationInput,
  );
}

async function loadLlmPromptGeneratorOptions() {
  return loadOptionsUseCase.execute();
}

module.exports = {
  generateLlmPrompt,
  generateLlmPromptFromPlan,
  generateLlmPromptWithDiagram,
  loadLlmPromptGeneratorOptions,
};
