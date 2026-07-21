import {
  GenerateLlmPrompt
} from "./generate_llm_prompt.js?v=20260722-generation-input-type";

export class GenerateLlmPromptWithDiagram extends GenerateLlmPrompt {
  generatePrompt(input) {
    return this.promptGenerator.generateWithDiagram(input);
  }
}
