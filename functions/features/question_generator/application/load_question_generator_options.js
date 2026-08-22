class LoadQuestionGeneratorOptions {
  constructor(loadLlmPromptGeneratorOptions) {
    this.loadLlmPromptGeneratorOptions = loadLlmPromptGeneratorOptions;
  }

  execute() {
    return this.loadLlmPromptGeneratorOptions();
  }
}

module.exports = {
  LoadQuestionGeneratorOptions,
};
