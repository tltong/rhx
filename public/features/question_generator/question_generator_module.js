import {
  generateLlmPrompt,
  generateLlmPromptWithDiagram,
  loadLlmPromptGeneratorOptions
} from "../llm_prompt_generator/llm_prompt_generator_module.js?v=20260722-mermaid-chart-repair";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260722-question-generator";
import {
  writeQuestions
} from "../question/question_module.js?v=20260722-question-generator";
import {
  renderMermaidDiagram
} from "../diagram_generator/diagram_generator_module.js?v=20260722-mermaid-chart-repair";
import {
  generateLlmText
} from "../../utils/llm/llm_ops.js?v=20260722-question-generator";
import {
  GenerateQuestions
} from "./application/generate_questions.js?v=20260722-mermaid-chart-repair";
import {
  LoadQuestionGeneratorOptions
} from "./application/load_question_generator_options.js?v=20260722-question-generator";

/**
 * @typedef {import("../llm_prompt_generator/domain/llm_prompt_generator.js").LlmPromptGenerationInput}
 * LlmPromptGenerationInput
 */
/**
 * @typedef {import("./domain/question_generation.js").QuestionGenerationResult}
 * QuestionGenerationResult
 */

const generateQuestionsUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPrompt,
  generateLlmText,
  getSyllabusById,
  writeQuestions
});
const generateQuestionsWithDiagramUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPromptWithDiagram,
  generateLlmText,
  getSyllabusById,
  writeQuestions,
  renderMermaidDiagram,
  hasDiagram: true
});
const loadQuestionGeneratorOptionsUseCase =
  new LoadQuestionGeneratorOptions(loadLlmPromptGeneratorOptions);

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {LlmPromptGenerationInput} generationInput
 * @returns {Promise<QuestionGenerationResult>}
 */
async function generateQuestions(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generateQuestionsUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {LlmPromptGenerationInput} generationInput
 * @returns {Promise<QuestionGenerationResult>}
 */
async function generateQuestionsWithDiagram(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generateQuestionsWithDiagramUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

async function loadQuestionGeneratorOptions() {
  return loadQuestionGeneratorOptionsUseCase.execute();
}

export {
  generateQuestions,
  generateQuestionsWithDiagram,
  loadQuestionGeneratorOptions
};
