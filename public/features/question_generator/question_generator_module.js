import {
  generateLlmPrompt,
  generateLlmPromptFromPlan,
  generateLlmPromptWithDiagram,
  loadLlmPromptGeneratorOptions
} from "../llm_prompt_generator/llm_prompt_generator_module.js?v=20260801-syllabus-topic-instructions";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260722-question-generator";
import {
  practiceTypes,
  writeQuestions
} from "../question/question_module.js?v=20260727-question-group";
import {
  writePreAssessmentQuestions
} from "../pre_assessment_question/pre_assessment_question_module.js?v=20260731-question-writer-routing";
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
} from "./application/generate_questions.js?v=20260731-question-writer-routing";
import {
  GeneratePlannedQuestions
} from "./application/generate_planned_questions.js?v=20260731-planned-question-batches";
import {
  LoadQuestionGeneratorOptions
} from "./application/load_question_generator_options.js?v=20260722-question-generator";
import {
  WriteGeneratedQuestions
} from "./application/write_generated_questions.js?v=20260731-question-writer-routing";

/**
 * @typedef {import("./domain/question_generation.js").QuestionGenerationInput}
 * QuestionGenerationInput
 */
/**
 * @typedef {import("./domain/question_generation.js").QuestionGenerationResult}
 * QuestionGenerationResult
 */

const writeGeneratedQuestionsUseCase = new WriteGeneratedQuestions({
  [practiceTypes.ASSESSMENT]: writeQuestions,
  [practiceTypes.PRE_ASSESSMENT]: writePreAssessmentQuestions
});

async function writeGeneratedQuestions(questionInputs) {
  return writeGeneratedQuestionsUseCase.execute(questionInputs);
}

const generateQuestionsUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPrompt,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.STANDARD_PRO
});
const generateQuestionsWithDiagramUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPromptWithDiagram,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  renderMermaidDiagram,
  hasDiagram: true,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.DIAGRAM_PRO
});
const generatePlannedQuestionsUseCase = new GeneratePlannedQuestions({
  generatePrompt: generateLlmPromptFromPlan,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  renderMermaidDiagram,
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

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {import("./domain/question_generation.js").PlannedQuestionGenerationInput} generationInput
 * @returns {Promise<QuestionGenerationResult & {batches: Object[]}>}
 */
async function generatePlannedQuestions(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generatePlannedQuestionsUseCase.execute(
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
  generatePlannedQuestions,
  loadQuestionGeneratorOptions,
  practiceTypes
};
