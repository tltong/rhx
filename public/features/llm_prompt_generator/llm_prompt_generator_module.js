import {
  getDefaultLlmPromptConfig,
  getLlmPromptConfigById
} from "../llm_prompt_config/llm_prompt_config_module.js?v=20260717-topic-attribution";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260717-topic-attribution";
import {
  LlmPromptGenerator,
  llmPromptDifficultyLevels
} from "./domain/llm_prompt_generator.js?v=20260717-topic-attribution";
import {
  GenerateLlmPrompt
} from "./application/generate_llm_prompt.js?v=20260717-topic-attribution";

const promptGenerator = new LlmPromptGenerator();
const generateLlmPromptUseCase = new GenerateLlmPrompt({
  getLlmPromptConfigById,
  getDefaultLlmPromptConfig,
  getSyllabusById,
  promptGenerator
});

async function generateLlmPrompt(input) {
  return generateLlmPromptUseCase.execute(input);
}

export {
  generateLlmPrompt,
  llmPromptDifficultyLevels
};
