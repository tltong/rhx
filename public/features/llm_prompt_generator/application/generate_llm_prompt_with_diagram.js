import {
  GenerateLlmPrompt
} from "./generate_llm_prompt.js?v=20260801-syllabus-topic-instructions";

export class GenerateLlmPromptWithDiagram extends GenerateLlmPrompt {
  generatePrompt(input) {
    return this.promptGenerator.generateWithDiagram(input);
  }
}
