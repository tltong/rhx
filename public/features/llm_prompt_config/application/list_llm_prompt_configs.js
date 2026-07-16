export class ListLlmPromptConfigs {
  constructor(llmPromptConfigRepository) {
    this.llmPromptConfigRepository = llmPromptConfigRepository;
  }

  async execute() {
    return this.llmPromptConfigRepository.list();
  }
}
