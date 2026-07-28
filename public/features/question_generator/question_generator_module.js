import {
  generateLlmPrompt,
  generateLlmPromptWithDiagram,
  loadLlmPromptGeneratorOptions
} from "../llm_prompt_generator/llm_prompt_generator_module.js?v=20260727-topic-diagram-percentage";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260722-question-generator";
import {
  practiceTypes,
  writeQuestions
} from "../question/question_module.js?v=20260727-question-group";
import {
  renderMermaidDiagram
} from "../diagram_generator/diagram_generator_module.js?v=20260724-thinking-disabled";
import {
  generateLlmText
} from "../../utils/llm/llm_ops.js?v=20260724-thinking-disabled";
import {
  DEEPSEEK_REQUEST_PROFILES
} from "../../utils/llm/deepseek_util.js?v=20260724-thinking-disabled";
import {
  GenerateQuestions
} from "./application/generate_questions.js?v=20260727-topic-diagram-config";
import {
  LoadQuestionGeneratorOptions
} from "./application/load_question_generator_options.js?v=20260722-question-generator";

/**
 * @typedef {import("./domain/question_generation.js").QuestionGenerationInput}
 * QuestionGenerationInput
 */
/**
 * @typedef {import("./domain/question_generation.js").QuestionGenerationResult}
 * QuestionGenerationResult
 */

const generateQuestionsUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPrompt,
  generateLlmText,
  getSyllabusById,
  writeQuestions,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.STANDARD_PRO
});
const generateQuestionsWithDiagramUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPromptWithDiagram,
  generateLlmText,
  getSyllabusById,
  writeQuestions,
  renderMermaidDiagram,
  hasDiagram: true,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.DIAGRAM_PRO
});
const loadQuestionGeneratorOptionsUseCase =
  new LoadQuestionGeneratorOptions(loadLlmPromptGeneratorOptions);

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {QuestionGenerationInput} generationInput
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
 * @param {QuestionGenerationInput} generationInput
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
  loadQuestionGeneratorOptions,
  practiceTypes
};
