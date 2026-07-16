export class UpdateLlmPromptConfig {
  constructor(llmPromptConfigRepository) {
    this.llmPromptConfigRepository = llmPromptConfigRepository;
  }

  async execute(llmPromptConfig, changes) {
    llmPromptConfig.update(changes);

    await this.llmPromptConfigRepository.save(llmPromptConfig);

    return llmPromptConfig;
  }
}
