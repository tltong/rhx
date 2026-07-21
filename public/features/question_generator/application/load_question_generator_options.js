export class LoadQuestionGeneratorOptions {
  constructor(loadLlmPromptGeneratorOptions) {
    this.loadLlmPromptGeneratorOptions = loadLlmPromptGeneratorOptions;
  }

  async execute() {
    return this.loadLlmPromptGeneratorOptions();
  }
}
