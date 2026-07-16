import { LlmPromptConfig } from "../domain/llm_prompt_config.js";

export class CreateLlmPromptConfig {
  constructor(llmPromptConfigRepository) {
    this.llmPromptConfigRepository = llmPromptConfigRepository;
  }

  async execute(data) {
    const llmPromptConfig = new LlmPromptConfig(data);

    await this.llmPromptConfigRepository.save(llmPromptConfig);

    return llmPromptConfig;
  }
}
