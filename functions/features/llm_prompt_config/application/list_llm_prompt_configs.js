class ListLlmPromptConfigs {
  constructor(repository) {
    this.repository = repository;
  }

  execute() {
    return this.repository.list();
  }
}

module.exports = {
  ListLlmPromptConfigs,
};
