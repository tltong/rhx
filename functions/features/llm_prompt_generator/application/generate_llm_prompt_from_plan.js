const {
  GenerateLlmPrompt,
} = require("./generate_llm_prompt");

class GenerateLlmPromptFromPlan extends GenerateLlmPrompt {
  generatePrompt(input) {
    return this.promptGenerator.generateFromPlan(input);
  }
}

module.exports = {
  GenerateLlmPromptFromPlan,
};
