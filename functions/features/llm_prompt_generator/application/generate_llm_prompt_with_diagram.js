const {
  GenerateLlmPrompt,
} = require("./generate_llm_prompt");

class GenerateLlmPromptWithDiagram extends GenerateLlmPrompt {
  generatePrompt(input) {
    return this.promptGenerator.generateWithDiagram(input);
  }
}

module.exports = {
  GenerateLlmPromptWithDiagram,
};
