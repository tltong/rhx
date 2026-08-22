class GetLlmPromptConfig {
  constructor(repository) {
    this.repository = repository;
  }

  execute(llmPromptConfigId) {
    return this.repository.getById(llmPromptConfigId);
  }
}

module.exports = {
  GetLlmPromptConfig,
};
