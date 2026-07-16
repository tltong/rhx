export class GetLlmPromptConfig {
  constructor(llmPromptConfigRepository) {
    this.llmPromptConfigRepository = llmPromptConfigRepository;
  }

  async execute(llmPromptConfigId) {
    return this.llmPromptConfigRepository.getById(llmPromptConfigId);
  }
}
