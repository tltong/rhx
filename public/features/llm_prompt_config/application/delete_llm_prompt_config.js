export class DeleteLlmPromptConfig {
  constructor(llmPromptConfigRepository) {
    this.llmPromptConfigRepository = llmPromptConfigRepository;
  }

  async execute(llmPromptConfigId) {
    await this.llmPromptConfigRepository.delete(llmPromptConfigId);
  }
}
