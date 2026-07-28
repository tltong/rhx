import {
  GenerateLlmPrompt
} from "./generate_llm_prompt.js?v=20260727-topic-diagram-percentage";

export class GenerateLlmPromptWithDiagram extends GenerateLlmPrompt {
  generatePrompt(input) {
    return this.promptGenerator.generateWithDiagram(input);
  }
}
