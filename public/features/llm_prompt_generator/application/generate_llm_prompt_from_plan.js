import {
  GenerateLlmPrompt
} from "./generate_llm_prompt.js?v=20260801-syllabus-topic-instructions";

export class GenerateLlmPromptFromPlan extends GenerateLlmPrompt {
  generatePrompt(input) {
    return this.promptGenerator.generateFromPlan(input);
  }
}
